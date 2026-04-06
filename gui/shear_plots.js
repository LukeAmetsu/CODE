document.addEventListener('DOMContentLoaded', () => {
    const btnGenerate = document.getElementById('btn-generate');
    const progressContainer = document.getElementById('progress-container');
    const progressStatus = document.getElementById('progress-status');
    const progressPercentage = document.getElementById('progress-percentage');
    const progressBar = document.getElementById('progress-bar');
    const plotsGallery = document.getElementById('plots-gallery');
    const emptyState = document.getElementById('empty-state');

    // Make Eel function available on window for Python to call
    eel.expose(update_shear_progress);
    function update_shear_progress(percentage, message, imagePath) {
        // Update progress bar and text
        progressBar.style.width = `${percentage}%`;
        progressPercentage.textContent = `${Math.round(percentage)}%`;
        progressStatus.textContent = message;

        // If an image path is provided, append it to the gallery
        if (imagePath) {
            emptyState.style.display = 'none';

            // Create image card
            const card = document.createElement('div');
            card.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col transition-transform hover:scale-105';
            
            // Image wrapper
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'w-full h-48 bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-2';
            
            // Generate a cache-busting URL to ensure the browser loads the newest image
            // Eel serves from the project root so /plots/... is the correct path from any page
            const imgUrl = `/${imagePath}?t=${new Date().getTime()}`;
            
            const img = document.createElement('img');
            img.src = imgUrl;
            img.className = 'max-w-full max-h-full object-contain';
            img.alt = message;
            img.loading = 'lazy'; // Lazy load since there are 126 of them

            imgWrapper.appendChild(img);

            // Title
            const contentDiv = document.createElement('div');
            contentDiv.className = 'p-3 flex-grow flex items-center justify-center border-t border-gray-200 dark:border-gray-700';
            
            // Extract a readable filename from the path
            const filename = imagePath.split('/').pop().replace('.png', '');
            
            const title = document.createElement('h4');
            title.className = 'text-xs font-semibold text-center text-[var(--color-text-primary)] truncate w-full';
            title.textContent = filename;
            title.title = filename; // Show full name on hover

            contentDiv.appendChild(title);
            card.appendChild(imgWrapper);
            card.appendChild(contentDiv);

            // Add to the beginning so newest plots appear first
            plotsGallery.prepend(card);
        }

        // Check if finished
        if (percentage >= 100) {
            btnGenerate.disabled = false;
            btnGenerate.textContent = "Start Generation";
            btnGenerate.classList.remove('opacity-50', 'cursor-not-allowed');
            setTimeout(() => {
                progressStatus.textContent = "All plots generated successfully!";
            }, 500);
        }
    }

    btnGenerate.addEventListener('click', async () => {
        // Disable button
        btnGenerate.disabled = true;
        btnGenerate.textContent = "Generating...";
        btnGenerate.classList.add('opacity-50', 'cursor-not-allowed');

        // Reset UI
        progressContainer.style.display = 'block';
        plotsGallery.innerHTML = '';
        emptyState.style.display = 'none';
        progressBar.style.width = '0%';
        progressPercentage.textContent = '0%';
        progressStatus.textContent = 'Starting processing...';

        try {
            // Call the python backend
            const result = await eel.run_shear_plots()();
            if (result && result.error) {
                progressStatus.textContent = `Error: ${result.error}`;
                progressStatus.classList.add('text-red-500');
                btnGenerate.disabled = false;
                btnGenerate.textContent = "Start Generation";
                btnGenerate.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        } catch (error) {
            progressStatus.textContent = `Error: ${error}`;
            progressStatus.classList.add('text-red-500');
            btnGenerate.disabled = false;
            btnGenerate.textContent = "Start Generation";
            btnGenerate.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
});
