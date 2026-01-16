# ================================
# NETLIFY DEPLOYMENT GUIDE
# ================================

## 🚀 Deploy invoice-app-v2 to Netlify via GitHub

### Prerequisites
1. ✅ Code pushed to GitHub (completed)
2. ✅ Netlify account
3. ✅ Firebase project with Authentication enabled
4. ✅ Firebase service account key

---

## 📋 Step-by-Step Deployment

### 1. **Connect Repository to Netlify**
1. Go to [Netlify Dashboard](https://app.netlify.com/)
2. Click "Add new site" → "Import an existing project"
3. Choose GitHub and authorize access
4. Select repository: `Maheshgok/invoice-pipeline-project-folder`

### 2. **Configure Build Settings**
```
Base directory: invoice-app-v2
Build command: npm run build
Publish directory: invoice-app-v2/dist
Functions directory: invoice-app-v2/netlify/functions
```

### 3. **Set Environment Variables**
In Netlify Dashboard → Site settings → Environment variables, add:

#### Frontend Variables (from your Firebase project settings):
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

#### Backend Functions Variables (from Firebase service account):
```
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=your_private_key_content_here
FIREBASE_PRIVATE_KEY_ID=key_id
FIREBASE_CLIENT_ID=client_id
```

#### API Configuration:
```
VITE_API_BASE_URL=https://your-site-name.netlify.app/.netlify/functions
VITE_PROCESSING_ENDPOINT=/process-invoice
```

### 4. **Firebase Service Account Setup**
1. Go to Firebase Console → Project Settings → Service accounts
2. Click "Generate new private key"
3. Download the JSON file
4. Extract the values for environment variables above

### 5. **Deploy**
1. Click "Deploy site" in Netlify
2. Monitor build logs for any issues
3. Once deployed, test the health endpoint: `https://your-site.netlify.app/.netlify/functions/health`

---

## 🔧 Available Netlify Functions

### `/health` - Health Check
- **Method**: GET
- **URL**: `https://your-site.netlify.app/.netlify/functions/health`
- **Description**: Check if functions are working

### `/process-invoice` - Process Invoices
- **Method**: POST
- **URL**: `https://your-site.netlify.app/.netlify/functions/process-invoice`
- **Headers**: `Authorization: Bearer <firebase-token>`
- **Body**: `{ "fileUrl": "url", "fileName": "name" }`
- **Description**: Process uploaded invoice files

### `/list-invoices` - List User Invoices
- **Method**: GET
- **URL**: `https://your-site.netlify.app/.netlify/functions/list-invoices`
- **Headers**: `Authorization: Bearer <firebase-token>`
- **Description**: Get list of processed invoices for authenticated user

---

## 🔒 Security Features

✅ **Firebase Authentication**: Secure user login
✅ **CORS Headers**: Proper cross-origin configuration  
✅ **Token Verification**: All functions verify Firebase ID tokens
✅ **User Isolation**: Users can only access their own data
✅ **HTTPS Only**: All traffic encrypted
✅ **Content Security Policy**: XSS protection

---

## 🐛 Troubleshooting

### Build Fails
- Check Node version is 18+
- Verify all environment variables are set
- Check build logs in Netlify dashboard

### Functions Not Working
- Verify Firebase service account variables
- Check function logs in Netlify dashboard
- Test with `/health` endpoint first

### Authentication Issues
- Verify Firebase config variables
- Check Firebase console for domain authorization
- Ensure API keys are correct

---

## 📁 Project Structure

```
invoice-app-v2/
├── src/                 # React frontend source
├── dist/                # Built frontend (auto-generated)
├── netlify/
│   └── functions/       # Serverless functions
├── netlify.toml        # Netlify configuration
├── package.json        # Frontend dependencies
└── .env.example        # Environment template
```

---

## 🔄 Updates & Maintenance

To update the application:
1. Make changes to code
2. Commit and push to GitHub
3. Netlify will automatically rebuild and deploy
4. Monitor deployment in Netlify dashboard

---

## 📞 Support

For deployment issues:
- Check Netlify deployment logs
- Verify all environment variables
- Test functions individually
- Check Firebase console for errors