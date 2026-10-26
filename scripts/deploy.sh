#!/usr/bin/env bash
# Release the api / web images by immutable tag (docs/runbooks/deploy-production.md).
#
#   scripts/deploy.sh                 build + deploy both services at HEAD (tag = git SHA)
#   scripts/deploy.sh --only api      one service; the other keeps its current tag
#   scripts/deploy.sh --tag <tag>     deploy an existing tag without building (rollback)
#
# The tag each service runs lives in SSM (/<prefix>/image-tag/{api,web}); ComputeStack
# resolves it on every CloudFormation deploy. ECR tags are immutable, so a tag is built
# and pushed once — an existing tag is reused, never overwritten. If the stack update
# fails, the SSM values are restored so the next compute deploy does not retry the build.
set -euo pipefail

PREFIX=${PREFIX:-ontology-mfg-dev}
REGION=${REGION:-ap-northeast-2}
ACCOUNT=${ACCOUNT:-061525506239}
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
RETAIL_VPC_EXPORT=${RETAIL_VPC_EXPORT:-ontology-retail-dev-vpc-id}
PRIVATE_SUBNETS=${PRIVATE_SUBNETS:-subnet-07b1e65682847dce9,subnet-095297380cd45e1eb}
PUBLIC_SUBNETS=${PUBLIC_SUBNETS:-subnet-08486a1e618b1991e,subnet-0c161777c4031c320}

services=(api web)
tag=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --only) services=("$2"); shift 2 ;;
    --tag) tag="$2"; shift 2 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
for s in "${services[@]}"; do
  [[ $s == api || $s == web ]] || { echo "--only takes api or web, got: $s" >&2; exit 2; }
done

cd "$(git rev-parse --show-toplevel)"
build=true
if [[ -n $tag ]]; then
  build=false
else
  # A tag names exactly one source tree: refuse to reuse the SHA for uncommitted changes.
  if [[ -n $(git status --porcelain) ]]; then
    [[ ${ALLOW_DIRTY:-0} == 1 ]] || {
      echo "working tree is dirty — commit first, or ALLOW_DIRTY=1 for a one-off -dirty tag" >&2
      exit 1
    }
    tag="$(git rev-parse --short=12 HEAD)-dirty-$(date -u +%Y%m%d%H%M%S)"
  else
    tag=$(git rev-parse --short=12 HEAD)
  fi
fi

image_exists() {
  aws ecr describe-images --region "$REGION" --repository-name "$PREFIX-$1" \
    --image-ids imageTag="$tag" >/dev/null 2>&1
}

logged_in=false
for s in "${services[@]}"; do
  if image_exists "$s"; then
    echo "==> $s:$tag already in ECR — reusing it"
    continue
  fi
  $build || { echo "$PREFIX-$s:$tag does not exist in ECR" >&2; exit 1; }
  if ! $logged_in; then
    aws ecr get-login-password --region "$REGION" \
      | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
    logged_in=true
  fi
  echo "==> building $s:$tag"
  docker build --platform linux/arm64 -f "$s/Dockerfile" -t "$REGISTRY/$PREFIX-$s:$tag" .
  docker push "$REGISTRY/$PREFIX-$s:$tag"
done

declare -A previous
for s in "${services[@]}"; do
  param="/$PREFIX/image-tag/$s"
  previous[$s]=$(aws ssm get-parameter --region "$REGION" --name "$param" \
    --query Parameter.Value --output text)
  aws ssm put-parameter --region "$REGION" --name "$param" --type String \
    --value "$tag" --overwrite >/dev/null
  echo "==> $param: ${previous[$s]} -> $tag"
done

# --force: the template is usually unchanged between releases; only the resolved SSM
# value differs, which CloudFormation picks up when it builds the change set.
if ! (cd infra-cdk && npx cdk deploy "$PREFIX-compute" --exclusively --force \
      --require-approval never \
      --context retailVpcExportName="$RETAIL_VPC_EXPORT" \
      --context privateSubnetIds="$PRIVATE_SUBNETS" \
      --context publicSubnetIds="$PUBLIC_SUBNETS"); then
  for s in "${services[@]}"; do
    aws ssm put-parameter --region "$REGION" --name "/$PREFIX/image-tag/$s" --type String \
      --value "${previous[$s]}" --overwrite >/dev/null
    echo "!! deploy failed — /$PREFIX/image-tag/$s restored to ${previous[$s]}" >&2
  done
  exit 1
fi

for s in "${services[@]}"; do
  digest=$(aws ecr describe-images --region "$REGION" --repository-name "$PREFIX-$s" \
    --image-ids imageTag="$tag" --query 'imageDetails[0].imageDigest' --output text)
  running=$(aws ecs list-tasks --region "$REGION" --cluster "$PREFIX-cluster" \
      --service-name "$PREFIX-$s" --desired-status RUNNING --query taskArns --output text \
    | xargs aws ecs describe-tasks --region "$REGION" --cluster "$PREFIX-cluster" \
      --query 'tasks[].containers[0].imageDigest' --output text --tasks)
  echo "==> $s:$tag ($digest) — running: $running"
done
