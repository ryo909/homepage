#!/usr/bin/env bash
set -euo pipefail

target_dir="assets/mochimaru/model"
target_name="gemma-web.task"
target_path="${target_dir}/${target_name}"

token="${HF_TOKEN:-}"
token="${token#Bearer }"
token="${token%\"}"
token="${token#\"}"
token="${token%$'\r'}"

has_token="false"
if [[ -n "${token}" ]]; then
  if [[ "${token}" != hf_* ]]; then
    echo "HF_TOKEN is set but does not look like a Hugging Face user access token. Ignoring it." >&2
  else
    has_token="true"
  fi
fi

mkdir -p "${target_dir}"

download_candidate() {
  local repo_id="$1"
  local source_name="$2"
  local access_mode="$3"
  local part_path="${target_path}.${source_name}.part"
  local download_url="https://huggingface.co/${repo_id}/resolve/main/${source_name}"
  local -a curl_args=(
    --fail
    --location
    --continue-at -
    --retry 3
    --retry-delay 2
    --output "${part_path}"
  )

  if [[ "${access_mode}" == "token" ]]; then
    if [[ "${has_token}" != "true" ]]; then
      echo "Skipping ${repo_id}/${source_name} because HF_TOKEN is unavailable for gated access." >&2
      return 1
    fi
    curl_args+=(--header "Authorization: Bearer ${token}")
  fi

  echo "Trying ${repo_id}/${source_name}"
  if ! curl "${curl_args[@]}" "${download_url}"; then
    echo "Failed to fetch ${repo_id}/${source_name}" >&2
    return 1
  fi

  mv "${part_path}" "${target_path}"
  echo "Downloaded ${repo_id}/${source_name} -> ${target_path}"
  ls -lh "${target_path}"
  return 0
}

if download_candidate "litert-community/gemma-3-270m-it" "gemma3-270m-it-q8-web.task" "token"; then
  exit 0
fi

if download_candidate "0x3/gemma3-1b-it-int4.task" "gemma3-1b-it-int4.task" "public"; then
  exit 0
fi

echo "Unable to download a Gemma Web model from any configured source." >&2
exit 1
