#!/usr/bin/env python3

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sys
from pathlib import Path, PurePosixPath
from typing import Any

import cv2
import numpy as np
import redis
from dotenv import load_dotenv
from insightface.app import FaceAnalysis

IMAGE_SUFFIXES = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".heic",
    ".heif",
    ".tif",
    ".tiff",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Scan image files with InsightFace and store face metadata in Kvrocks "
            "for the travel-photo-album app."
        )
    )
    parser.add_argument(
        "--section",
        action="append",
        default=[],
        help="Section id or section name to scan. Repeat to scan multiple sections.",
    )
    parser.add_argument(
        "--people-file",
        help="JSON file with known people and reference images for person-name matching.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Stop after indexing N images (default: 0 = no limit).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Recompute face metadata even if a Kvrocks entry already exists.",
    )
    parser.add_argument(
        "--model",
        default="buffalo_l",
        help="InsightFace model pack name (default: buffalo_l).",
    )
    parser.add_argument(
        "--providers",
        default="CPUExecutionProvider",
        help="Comma-separated ONNX runtime providers.",
    )
    parser.add_argument(
        "--ctx-id",
        type=int,
        default=0,
        help="InsightFace ctx_id passed to FaceAnalysis.prepare (default: 0).",
    )
    parser.add_argument(
        "--det-size",
        type=int,
        default=640,
        help="Square detector size passed to FaceAnalysis.prepare (default: 640).",
    )
    parser.add_argument(
        "--match-threshold",
        type=float,
        default=0.45,
        help="Minimum cosine similarity for a known-person match (default: 0.45).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    load_dotenv(repo_root / ".env")

    kv_url = os.environ.get("THUMB_KV_URL", "").strip()
    if not kv_url:
        print("THUMB_KV_URL is required", file=sys.stderr)
        return 1

    kv_prefix = os.environ.get("THUMB_KV_PREFIX", "travel-photo-album:thumb:v1").strip()
    redis_client = redis.Redis.from_url(kv_url, decode_responses=True)

    sections = resolve_sections(load_config(repo_root), args.section)
    if not sections:
        print("No matching sections found", file=sys.stderr)
        return 1

    providers = [provider.strip() for provider in args.providers.split(",") if provider.strip()]
    analysis = FaceAnalysis(name=args.model, providers=providers)
    analysis.prepare(ctx_id=args.ctx_id, det_size=(args.det_size, args.det_size))

    people_index = load_people_index(
        analysis,
        Path(args.people_file).expanduser() if args.people_file else None,
    )

    processed = 0
    indexed = 0
    skipped = 0
    for section in sections:
        section_label = f"[{section['id']}] {section['name']}"
        section_path = Path(section["path"])
        if not section_path.exists():
            print(f"skip {section_label}: missing path {section_path}", file=sys.stderr)
            continue

        for image_path in iter_image_files(section_path):
            relative_parts = list(PurePosixPath(image_path.relative_to(section_path).as_posix()).parts)
            if not args.force and face_metadata_exists(redis_client, kv_prefix, section, relative_parts):
                skipped += 1
                continue

            try:
                face_metadata = analyze_image(
                    analysis,
                    args.model,
                    image_path,
                    relative_parts,
                    people_index,
                    args.match_threshold,
                )
                write_face_metadata(redis_client, kv_prefix, section, relative_parts, face_metadata)
                indexed += 1
                print(
                    f"indexed {section_label} {PurePosixPath(*relative_parts)} "
                    f"faces={len(face_metadata.get('faces', []))} "
                    f"people={','.join(face_metadata.get('personNames', [])) or '-'}"
                )
            except Exception as error:  # noqa: BLE001
                print(f"error {section_label} {image_path}: {error}", file=sys.stderr)

            processed += 1
            if args.limit > 0 and processed >= args.limit:
                print(
                    f"done processed={processed} indexed={indexed} skipped={skipped} limit={args.limit}"
                )
                return 0

    print(f"done processed={processed} indexed={indexed} skipped={skipped}")
    return 0


def load_config(repo_root: Path) -> dict[str, Any]:
    with (repo_root / "config.json").open("r", encoding="utf-8") as config_file:
        return json.load(config_file)


def resolve_sections(config: dict[str, Any], requested_sections: list[str]) -> list[dict[str, Any]]:
    all_sections: list[dict[str, Any]] = []
    for index, raw_section in enumerate(config.get("sections", [])):
        if not isinstance(raw_section, dict):
            continue

        resolved_path = resolve_section_path(raw_section)
        if not resolved_path:
            continue
        section = dict(raw_section)
        section["id"] = index
        section["path"] = resolved_path
        all_sections.append(section)

    if not requested_sections:
        return all_sections

    requested = {value.strip() for value in requested_sections if value.strip()}
    selected: list[dict[str, Any]] = []
    for section in all_sections:
        if str(section["id"]) in requested or str(section.get("name", "")).strip() in requested:
            selected.append(section)
    return selected


def resolve_section_path(section: dict[str, Any]) -> str | None:
    if sys.platform == "darwin":
        candidates = [section.get("path"), section.get("macPath"), section.get("linuxPath"), section.get("winPath")]
    elif os.name == "nt":
        candidates = [section.get("path"), section.get("winPath"), section.get("pathWindows"), section.get("macPath")]
    else:
        candidates = [section.get("path"), section.get("linuxPath"), section.get("macPath"), section.get("winPath")]

    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def iter_image_files(section_path: Path):
    for file_path in sorted(section_path.rglob("*")):
        if file_path.is_file() and file_path.suffix.lower() in IMAGE_SUFFIXES:
            yield file_path


def face_metadata_exists(
    redis_client: redis.Redis,
    kv_prefix: str,
    section: dict[str, Any],
    relative_parts: list[str],
) -> bool:
    keys = get_face_keys(kv_prefix, section, relative_parts)
    return any(bool(redis_client.exists(key)) for key in keys)


def analyze_image(
    analysis: FaceAnalysis,
    model_name: str,
    image_path: Path,
    relative_parts: list[str],
    people_index: list[dict[str, Any]],
    match_threshold: float,
) -> dict[str, Any]:
    image = cv2.imread(str(image_path))
    if image is None:
        raise RuntimeError("unable to read image")

    detected_faces = analysis.get(image)
    stored_faces: list[dict[str, Any]] = []
    person_names: set[str] = set()

    for index, face in enumerate(detected_faces):
        bbox = getattr(face, "bbox", None)
        embedding = getattr(face, "embedding", None)
        if bbox is None or embedding is None:
            continue

        x1, y1, x2, y2 = [float(value) for value in bbox.tolist()]
        matched_person = match_person(embedding, people_index, match_threshold)
        if matched_person and matched_person.get("name"):
            person_names.add(matched_person["name"])

        stored_faces.append(
            {
                "faceId": build_face_id(relative_parts, index, x1, y1, x2, y2),
                "box": {
                    "x": round(x1, 2),
                    "y": round(y1, 2),
                    "width": round(max(0.0, x2 - x1), 2),
                    "height": round(max(0.0, y2 - y1), 2),
                },
                "detectorScore": round(float(getattr(face, "det_score", 0.0)), 6),
                "embedding": round_embedding(embedding),
                "personId": matched_person["id"] if matched_person else None,
                "personName": matched_person["name"] if matched_person else None,
                "matchScore": matched_person["score"] if matched_person else None,
            }
        )

    return {
        "model": model_name,
        "analyzedAt": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "personNames": sorted(person_names),
        "faces": stored_faces,
    }


def round_embedding(embedding: Any) -> list[float]:
    values = np.asarray(embedding, dtype=np.float32)
    return [round(float(value), 6) for value in values.tolist()]


def build_face_id(
    relative_parts: list[str],
    index: int,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
) -> str:
    return hashlib.sha1(
        json.dumps(
            {
                "filePath": "/".join(relative_parts),
                "index": index,
                "bbox": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
            },
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()


def load_people_index(
    analysis: FaceAnalysis,
    people_file: Path | None,
) -> list[dict[str, Any]]:
    if not people_file:
        return []
    if not people_file.exists():
        raise FileNotFoundError(f"people file does not exist: {people_file}")

    with people_file.open("r", encoding="utf-8") as handle:
        raw_people = json.load(handle)

    people_records = raw_people.get("people", raw_people) if isinstance(raw_people, dict) else raw_people
    if not isinstance(people_records, list):
        raise ValueError("people file must be an array or an object with a people array")

    index: list[dict[str, Any]] = []
    for person in people_records:
        if not isinstance(person, dict):
            continue

        person_id = str(person.get("id") or person.get("name") or "").strip()
        person_name = str(person.get("name") or person_id).strip()
        reference_images = person.get("referenceImages") or person.get("reference_images") or []
        if not person_id or not person_name or not isinstance(reference_images, list):
            continue

        embeddings: list[np.ndarray] = []
        for reference_image in reference_images:
            reference_path = Path(str(reference_image)).expanduser()
            if not reference_path.is_absolute():
                reference_path = (people_file.parent / reference_path).resolve()
            embeddings.extend(extract_reference_embeddings(analysis, reference_path))

        if not embeddings:
            raise ValueError(f"person {person_name} has no usable face embeddings")

        average_embedding = np.mean(np.stack(embeddings), axis=0)
        average_embedding = normalize_embedding(average_embedding)
        index.append({"id": person_id, "name": person_name, "embedding": average_embedding})

    return index


def extract_reference_embeddings(analysis: FaceAnalysis, image_path: Path) -> list[np.ndarray]:
    image = cv2.imread(str(image_path))
    if image is None:
        raise RuntimeError(f"unable to read reference image {image_path}")

    faces = analysis.get(image)
    if not faces:
        raise RuntimeError(f"no faces found in reference image {image_path}")

    return [normalize_embedding(np.asarray(face.embedding, dtype=np.float32)) for face in faces if getattr(face, "embedding", None) is not None]


def normalize_embedding(embedding: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(embedding))
    if norm == 0.0:
        raise ValueError("zero-length embedding")
    return embedding / norm


def match_person(
    embedding: Any,
    people_index: list[dict[str, Any]],
    match_threshold: float,
) -> dict[str, Any] | None:
    if not people_index:
        return None

    candidate = normalize_embedding(np.asarray(embedding, dtype=np.float32))
    best_match: dict[str, Any] | None = None
    for person in people_index:
        score = float(np.dot(candidate, person["embedding"]))
        if score < match_threshold:
            continue
        if best_match is None or score > best_match["score"]:
            best_match = {"id": person["id"], "name": person["name"], "score": round(score, 6)}
    return best_match


def write_face_metadata(
    redis_client: redis.Redis,
    kv_prefix: str,
    section: dict[str, Any],
    relative_parts: list[str],
    payload: dict[str, Any],
) -> None:
    encoded = json.dumps(payload, separators=(",", ":"))
    registry_value = "/".join(relative_parts)
    for key in get_face_keys(kv_prefix, section, relative_parts):
        redis_client.set(key, encoded)
    for registry_key in get_face_registry_keys(kv_prefix, section):
        redis_client.sadd(registry_key, registry_value)


def get_face_keys(kv_prefix: str, section: dict[str, Any], relative_parts: list[str]) -> list[str]:
    relative_path = "/".join(relative_parts)
    return [build_stored_face_key(kv_prefix, alias, relative_path) for alias in get_section_key_aliases(section)]


def get_face_registry_keys(kv_prefix: str, section: dict[str, Any]) -> list[str]:
    return [build_face_registry_key(kv_prefix, alias) for alias in get_section_key_aliases(section)]


def build_stored_face_key(kv_prefix: str, section_key: str, file_path: str) -> str:
    payload = json.dumps(
        {"sectionKey": section_key, "filePath": file_path, "kind": "face-meta"},
        separators=(",", ":"),
    )
    return f"{kv_prefix}:face-meta:{hashlib.sha1(payload.encode('utf-8')).hexdigest()}"


def build_face_registry_key(kv_prefix: str, section_key: str) -> str:
    payload = json.dumps(
        {"sectionKey": section_key, "kind": "face-registry"},
        separators=(",", ":"),
    )
    return f"{kv_prefix}:face-registry:{hashlib.sha1(payload.encode('utf-8')).hexdigest()}"


def get_section_key_aliases(section: dict[str, Any]) -> list[str]:
    aliases: set[str] = set()
    host_root = os.environ.get("MEDIA_ROOT_HOST_PATH", "/Volumes/photo").strip() or "/Volumes/photo"
    container_root = os.environ.get("MEDIA_ROOT_CONTAINER_PATH", "/media/nas/photo").strip() or "/media/nas/photo"

    for candidate in [
        section.get("path"),
        section.get("macPath"),
        section.get("linuxPath"),
        section.get("winPath"),
        section.get("pathWindows"),
        section.get("name"),
    ]:
        if not isinstance(candidate, str) or not candidate.strip():
            continue

        normalized = candidate.strip()
        aliases.add(normalized)

        host_to_container = remap_section_key(normalized, host_root, container_root)
        if host_to_container:
            aliases.add(host_to_container)

        container_to_host = remap_section_key(normalized, container_root, host_root)
        if container_to_host:
            aliases.add(container_to_host)

    return sorted(aliases) or ["section"]


def remap_section_key(section_key: str, from_root: str, to_root: str) -> str | None:
    if not section_key or not from_root or not to_root:
        return None
    if section_key == from_root:
        return to_root
    if section_key.startswith(f"{from_root}/"):
        return f"{to_root}{section_key[len(from_root):]}"
    return None


if __name__ == "__main__":
    raise SystemExit(main())
