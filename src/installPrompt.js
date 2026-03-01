/**
 * installPrompt.js - Handles the PWA "Add to Home Screen" logic
 */

let deferredPrompt;

export function initInstallPrompt() {
    const installBtn = document.createElement('button');
    installBtn.id = 'pwa-install-btn';
    installBtn.className = 'btn btn-secondary btn-sm hidden';
    installBtn.innerHTML = '📱 Install App';
    installBtn.style.position = 'fixed';
    installBtn.style.bottom = '1rem';
    installBtn.style.right = '1rem';
    installBtn.style.zIndex = '1000';
    document.body.appendChild(installBtn);

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI to notify the user they can add to home screen
        installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
        // hide our user interface that shows our A2HS button
        installBtn.classList.add('hidden');
        if (!deferredPrompt) return;

        // Show the prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        // We've used the prompt, and can't use it again, throw it away
        deferredPrompt = null;
    });

    window.addEventListener('appinstalled', () => {
        // Hide the app-provided install promotion
        installBtn.classList.add('hidden');
        // Clear the deferredPrompt so it can be garbage collected
        deferredPrompt = null;
        console.log('PWA was installed');
    });
}
