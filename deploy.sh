#!/bin/bash

# Invoice Processing System - Quick Deploy Script
# This script helps you deploy both PWA and main apps

echo "🚀 Invoice Processing System - Quick Deploy"
echo "=========================================="

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command_exists node; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

if ! command_exists npm; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Prerequisites satisfied"

# Ask user what to deploy
echo ""
echo "What would you like to deploy?"
echo "1) PWA App only"
echo "2) Main App only" 
echo "3) Both apps"
read -p "Choose option (1-3): " choice

# Deploy PWA
deploy_pwa() {
    echo ""
    echo "📱 Building PWA App..."
    cd invoice-pwa-app || exit
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing PWA dependencies..."
        npm install
    fi
    
    # Build for production
    echo "🔨 Building PWA for production..."
    npm run build
    
    if [ $? -eq 0 ]; then
        echo "✅ PWA build successful!"
        echo "📁 Build files are in: invoice-pwa-app/dist/"
        echo "🌐 You can deploy the 'dist' folder to:"
        echo "   - Netlify (drag & drop)"
        echo "   - Vercel (vercel --prod)"
        echo "   - Firebase Hosting (firebase deploy)"
    else
        echo "❌ PWA build failed. Check the errors above."
    fi
    
    cd ..
}

# Deploy main app
deploy_main() {
    echo ""
    echo "💼 Building Main App..."
    cd invoice-app-v2 || exit
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing Main App dependencies..."
        npm install
    fi
    
    # Build for production  
    echo "🔨 Building Main App for production..."
    npm run build
    
    if [ $? -eq 0 ]; then
        echo "✅ Main App build successful!"
        echo "📁 Build files are in: invoice-app-v2/dist/"
        echo "🌐 You can deploy the 'dist' folder to your hosting service"
    else
        echo "❌ Main App build failed. Check the errors above."
    fi
    
    cd ..
}

# Execute based on choice
case $choice in
    1)
        deploy_pwa
        ;;
    2)
        deploy_main
        ;;
    3)
        deploy_pwa
        deploy_main
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
echo "🎉 Deployment preparation complete!"
echo ""
echo "Next steps:"
echo "1. Set up environment variables on your hosting platform"
echo "2. Upload the built files to your hosting service"
echo "3. Configure custom domain (optional)"
echo "4. Test the deployed applications"
echo ""
echo "📚 For detailed instructions, see DEPLOYMENT_GUIDE.md"