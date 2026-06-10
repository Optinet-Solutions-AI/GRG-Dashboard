#!/usr/bin/env bash
# Deploy (or re-deploy) the PSI proof-screenshot automation to a GCP project:
# enables APIs, stores the Supabase service-role key as a secret, builds the
# container, creates the Cloud Run Job, and schedules it (1st & 16th, 09:00 Manila).
# Idempotent — safe to re-run. Reads Supabase config from ../.env.
#
#   gcloud auth login              # sign in as the account that owns the project
#   bash scripts/deploy-psi-cloudrun.sh <PROJECT_ID> [REGION]
#
set -euo pipefail

PROJECT="${1:?usage: deploy-psi-cloudrun.sh <PROJECT_ID> [REGION]}"
REGION="${2:-asia-southeast1}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ENVFILE="$HERE/../.env"

SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' "$ENVFILE" | cut -d= -f2-)
KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$ENVFILE" | cut -d= -f2-)
[ -n "$SUPABASE_URL" ] && [ -n "$KEY" ] || { echo "ERROR: Supabase vars missing in .env"; exit 1; }

IMG="${REGION}-docker.pkg.dev/${PROJECT}/psi/psi-capture"
SA="psi-scheduler@${PROJECT}.iam.gserviceaccount.com"

echo "==> Project: $PROJECT  Region: $REGION"
gcloud config set project "$PROJECT"

echo "==> Enabling APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com

echo "==> Secret (Supabase service-role key)"
gcloud secrets create psi-supabase-key --replication-policy=automatic 2>/dev/null || true
printf '%s' "$KEY" | gcloud secrets versions add psi-supabase-key --data-file=-
PNUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding psi-supabase-key \
  --member="serviceAccount:${PNUM}-compute@developer.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor >/dev/null

echo "==> Build image"
gcloud artifacts repositories create psi --repository-format=docker --location="$REGION" 2>/dev/null || true
( cd "$HERE/../cloud-run/psi-capture" && gcloud builds submit --tag "$IMG" )

echo "==> Cloud Run Job (create or update)"
gcloud run jobs deploy psi-capture --image "$IMG" --region "$REGION" \
  --memory 2Gi --cpu 1 --task-timeout 600 --max-retries 1 \
  --set-env-vars "NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}" \
  --set-secrets "SUPABASE_SERVICE_ROLE_KEY=psi-supabase-key:latest"

echo "==> Scheduler (1st & 16th, 09:00 Asia/Manila)"
gcloud iam service-accounts create psi-scheduler --display-name "PSI capture scheduler" 2>/dev/null || true
gcloud run jobs add-iam-policy-binding psi-capture --region "$REGION" \
  --member "serviceAccount:${SA}" --role roles/run.invoker >/dev/null
URI="https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/psi-capture:run"
gcloud scheduler jobs create http psi-capture-biweekly --location "$REGION" \
  --schedule "0 9 1,16 * *" --time-zone "Asia/Manila" --uri "$URI" \
  --http-method POST --oauth-service-account-email "$SA" 2>/dev/null \
|| gcloud scheduler jobs update http psi-capture-biweekly --location "$REGION" \
  --schedule "0 9 1,16 * *" --time-zone "Asia/Manila" --uri "$URI" \
  --http-method POST --oauth-service-account-email "$SA"

echo ""
echo "Done. Run a test capture now with:"
echo "  gcloud run jobs execute psi-capture --region $REGION --wait"
