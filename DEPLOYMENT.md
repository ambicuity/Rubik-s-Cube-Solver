# GitHub Pages Deployment Configuration

This file documents the GitHub Pages deployment setup for the Rubik's Cube Solver.

## Deployment Settings

- **Source Branch**: main (or your default branch)
- **Source Folder**: / (root)
- **Custom Domain**: Optional - configure in repository settings
- **HTTPS**: Enabled by default

## How to Deploy

1. Go to your repository settings on GitHub
2. Navigate to "Pages" section
3. Under "Source", select the branch you want to deploy (e.g., `main`)
4. Select folder: `/ (root)`
5. Click "Save"

Your site will be available at: `https://[username].github.io/Rubik-s-Cube-Solver/`

## Files Required for Deployment

All files in the root directory are served:
- `index.html` - Main application page
- `styles.css` - Styling
- `src/` - JavaScript modules
- `proxy/` - Proxy implementation examples (for reference only)

Note: The `proxy/` folder contains examples only. You need to deploy these separately to Cloudflare Workers or Google Cloud Functions.

## Testing Deployment

After deployment:
1. Visit your GitHub Pages URL
2. Click "Start Camera" (allow camera access)
3. Capture all 6 cube faces
4. Validate and solve

## Troubleshooting

If the page doesn't load:
- Check that GitHub Pages is enabled in settings
- Verify the branch and folder are correct
- Check browser console for errors
- Ensure HTTPS is enabled (required for webcam access)

If camera doesn't work:
- GitHub Pages serves over HTTPS (required for camera API)
- Check browser permissions
- Try a different browser

## Custom Domain (Optional)

To use a custom domain:
1. Add a `CNAME` file with your domain name
2. Configure DNS settings at your domain provider
3. Enable HTTPS in repository settings
