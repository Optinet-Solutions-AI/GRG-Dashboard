# PSI proof-screenshot — Cloud Run Job

Captures the real Google PageSpeed Insights **report page** (gauges + "Report from …")
for every active `pagespeed_url`, mobile + desktop, and uploads it to Supabase as the
proof screenshot. Runs on a schedule via Cloud Scheduler — no servers, scales to zero.

> Scores still auto-refresh on the Vercel cron (PSI API). This job adds the **visual proof**.

## One-time setup (run from this folder, with `gcloud` authenticated)

```bash
# ---- your values ----
export PROJECT=YOUR_GCP_PROJECT_ID            # the project that owns billing
export REGION=asia-southeast1                  # any Cloud Run region is fine
export SUPABASE_URL=https://qcanhihytgmexcvjhpic.supabase.co

gcloud config set project "$PROJECT"

# 1) Enable the APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com

# 2) Store the Supabase SERVICE ROLE key as a secret (paste the key when prompted, then Ctrl-D)
gcloud secrets create psi-supabase-key --replication-policy=automatic
gcloud secrets versions add psi-supabase-key --data-file=-

# 3) Build the container image (Cloud Build)
gcloud builds submit --tag "gcr.io/$PROJECT/psi-capture"

# 4) Create the Cloud Run JOB (Chromium needs memory; give it room + a long timeout)
gcloud run jobs create psi-capture \
  --image "gcr.io/$PROJECT/psi-capture" \
  --region "$REGION" \
  --memory 2Gi --cpu 1 --task-timeout 600 --max-retries 1 \
  --set-env-vars "NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL" \
  --set-secrets "SUPABASE_SERVICE_ROLE_KEY=psi-supabase-key:latest"

# 5) Test it once
gcloud run jobs execute psi-capture --region "$REGION" --wait
```

After step 5, refresh the dashboard's PageSpeed page — the report screenshots should be fresh.

## Schedule it (every 15 days, 1st & 16th at 06:00)

```bash
export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
export SA="psi-scheduler@$PROJECT.iam.gserviceaccount.com"

# A service account allowed to run the job
gcloud iam service-accounts create psi-scheduler --display-name "PSI capture scheduler"
gcloud run jobs add-iam-policy-binding psi-capture --region "$REGION" \
  --member "serviceAccount:$SA" --role roles/run.invoker

# Cloud Scheduler -> Cloud Run Jobs run endpoint (1st & 16th of each month)
gcloud scheduler jobs create http psi-capture-biweekly \
  --location "$REGION" \
  --schedule "0 6 1,16 * *" --time-zone "Asia/Dubai" \
  --uri "https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/psi-capture:run" \
  --http-method POST \
  --oauth-service-account-email "$SA"
```

## Updating the job after a code change

```bash
gcloud builds submit --tag "gcr.io/$PROJECT/psi-capture"
gcloud run jobs update psi-capture --image "gcr.io/$PROJECT/psi-capture" --region "$REGION"
```

## Cost
A run is ~1–2 min of 1 vCPU / 2 GiB, twice a month → effectively within the Cloud Run free tier.

## Notes
- The PSI analysis runs on Google's servers regardless of the job's region, so region doesn't affect scores.
- If a run times out, raise `--task-timeout` (pagespeed.web.dev can be slow under load).
- The job uses the Supabase **service role** key (server-side only) — keep it in Secret Manager, never in the image.
