# Invoice Processing System - Quick Deploy Script for Windows
# This script helps you deploy both PWA and main apps

Write-Host "🚀 Invoice Processing System - Quick Deploy" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is not installed. Please install Node.js first." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ npm is not installed. Please install npm first." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Prerequisites satisfied" -ForegroundColor Green

# Ask user what to deploy
Write-Host ""
Write-Host "What would you like to deploy?"
Write-Host "1) PWA App only"
Write-Host "2) Main App only" 
Write-Host "3) Both apps"
$choice = Read-Host "Choose option (1-3)"

# Deploy PWA function
function Deploy-PWA {
    Write-Host ""
    Write-Host "📱 Building PWA App..." -ForegroundColor Yellow
    
    Set-Location "invoice-pwa-app"
    
    # Install dependencies if needed
    if (-not (Test-Path "node_modules")) {
        Write-Host "📦 Installing PWA dependencies..." -ForegroundColor Yellow
        npm install
    }
    
    # Build for production
    Write-Host "🔨 Building PWA for production..." -ForegroundColor Yellow
    npm run build
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ PWA build successful!" -ForegroundColor Green
        Write-Host "📁 Build files are in: invoice-pwa-app/dist/" -ForegroundColor Cyan
        Write-Host "🌐 You can deploy the 'dist' folder to:" -ForegroundColor Cyan
        Write-Host "   - Netlify (drag & drop)" -ForegroundColor Cyan
        Write-Host "   - Vercel (vercel --prod)" -ForegroundColor Cyan
        Write-Host "   - Firebase Hosting (firebase deploy)" -ForegroundColor Cyan
    } else {
        Write-Host "❌ PWA build failed. Check the errors above." -ForegroundColor Red
    }
    
    Set-Location ".."
}

# Deploy main app function
function Deploy-Main {
    Write-Host ""
    Write-Host "💼 Building Main App..." -ForegroundColor Yellow
    
    Set-Location "invoice-app-v2"
    
    # Install dependencies if needed
    if (-not (Test-Path "node_modules")) {
        Write-Host "📦 Installing Main App dependencies..." -ForegroundColor Yellow
        npm install
    }
    
    # Build for production  
    Write-Host "🔨 Building Main App for production..." -ForegroundColor Yellow
    npm run build
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Main App build successful!" -ForegroundColor Green
        Write-Host "📁 Build files are in: invoice-app-v2/dist/" -ForegroundColor Cyan
        Write-Host "🌐 You can deploy the 'dist' folder to your hosting service" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Main App build failed. Check the errors above." -ForegroundColor Red
    }
    
    Set-Location ".."
}

# Execute based on choice
switch ($choice) {
    "1" {
        Deploy-PWA
    }
    "2" {
        Deploy-Main
    }
    "3" {
        Deploy-PWA
        Deploy-Main
    }
    default {
        Write-Host "❌ Invalid choice. Please run the script again." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "🎉 Deployment preparation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Set up environment variables on your hosting platform" -ForegroundColor White
Write-Host "2. Upload the built files to your hosting service" -ForegroundColor White
Write-Host "3. Configure custom domain (optional)" -ForegroundColor White
Write-Host "4. Test the deployed applications" -ForegroundColor White
Write-Host ""
Write-Host "📚 For detailed instructions, see DEPLOYMENT_GUIDE.md" -ForegroundColor Cyan