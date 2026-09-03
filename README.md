# Optitex & NedGraphics — European Sales Dashboard

## Deployment steps

### 1. Push to GitHub
1. Create a new repository on github.com (name it `sales-dashboard`)
2. Upload all these files to the repository

### 2. Deploy on Vercel
1. Go to vercel.com → New Project
2. Import your GitHub repository
3. Click Deploy (default settings are fine)

### 3. Add your HubSpot token
1. In Vercel → your project → Settings → Environment Variables
2. Add: `HUBSPOT_TOKEN` = (paste your HubSpot private app token)
3. Redeploy the project

### 4. Share the URL
Vercel gives you a permanent URL like `https://sales-dashboard-abc123.vercel.app`
Share this with your team — targets are saved per browser automatically.

## HubSpot private app setup
Settings → Integrations → Private Apps → Create private app
Required scopes: `crm.objects.deals.read` · `crm.schemas.deals.read` · `crm.objects.owners.read`

## Auto-refresh
The dashboard refreshes live data every time it loads.
The cron job in vercel.json also pings the API at midnight (00:00 UTC) to warm the cache.

## Fields used
- `optitex_subscription` — Subscription value
- `optitex_license` — Licence value  
- `brands` — Brand (Optitex / NedGraphics)
- `dealstage` — Stage
- `hubspot_owner_id` — Deal owner (matched to SM)
- `closedate` — Close date

