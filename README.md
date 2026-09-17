# White Solutions

Premium digital storefront for selling high-value digital products.

## Stack
- Frontend: static HTML/CSS/JS
- Backend: Node.js + Express
- Email: Nodemailer
- Payments: Whop
- Hosting: Netlify + Render

## Local setup

1. Install dependencies:
   npm install

2. Copy environment variables:
   cp .env.example .env

3. Fill in your real values.

4. Start the backend:
   npm start

5. Open the storefront at:
   http://localhost:3000

## Product flow
- Customers select a product and enter their email.
- Frontend calls the backend checkout route.
- A secure download token is created.
- The backend sends the PDF download link by email.
- The customer is redirected to the secure download URL.

## Deployment

### Frontend on Netlify
- Import the repository into Netlify.
- Set the publish directory to `.`.
- Use the included [netlify.toml](netlify.toml).

### Backend on Render
- Create a new Web Service.
- Connect the repository.
- Use the included [render.yaml](render.yaml) or set these settings manually:
  - Build Command: `npm install && npm run build`
  - Start Command: `npm start`

### Environment variables for Render
- PORT
- WHOP_ACCOUNT_ID
- WHOP_API_KEY
- WHOP_WEBHOOK_SECRET
- PUBLIC_BASE_URL
- APP_BASE_URL
- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASS
- SMTP_FROM

## Whop webhook
Use the Whop webhook with your backend URL:
- https://your-render-app.onrender.com/api/whop/webhook

The backend verifies the webhook signature and grants access when payment is successful.

## Important
Do not embed actual PDF files in the frontend. Keep them on the backend or secure storage and send download links after purchase.
