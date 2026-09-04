document.addEventListener("DOMContentLoaded", () => {
    const generateBtn = document.getElementById("generate-btn");
    const exportBtn = document.getElementById("export-btn");
    const loadInput = document.getElementById("load_psf");
    const heightInput = document.getElementById("pipe_height");
    
    const resultsContainer = document.getElementById("results-container");
    const errorAlert = document.getElementById("error-alert");
    
    const matrixHead = document.getElementById("matrix-head");
    const matrixBody = document.getElementById("matrix-body");
    
    const dispLoad = document.getElementById("disp_load");
    const dispHeight = document.getElementById("disp_height");

    // Keep inputs in scope for export
    let lastInputs = null;

    generateBtn.addEventListener("click", async () => {
        // Collect Inputs
        lastInputs = {
            load: parseFloat(loadInput.value) || 300,
            pipe_height: parseFloat(heightInput.value) || 14
        };

        // Reset UI
        errorAlert.classList.add("hidden");
        resultsContainer.classList.add("hidden");
        exportBtn.classList.add("hidden");
        generateBtn.disabled = true;
        generateBtn.innerHTML = `
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generating...
        `;

        try {
            // Call Python Backend
            const result = await eel.generate_shed_matrix(lastInputs)();

            if (result.error) {
                showError(result.error);
            } else {
                renderMatrix(result.data, lastInputs);
                exportBtn.classList.remove("hidden"); // Show export button
            }

        } catch (err) {
            console.error(err);
            showError("A connection error occurred. Make sure the backend is running.");
        } finally {
            generateBtn.disabled = false;
            generateBtn.innerText = "Generate Matrix";
        }
    });

    exportBtn.addEventListener("click", async () => {
        if (!lastInputs) return;
        
        exportBtn.disabled = true;
        exportBtn.innerHTML = `
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            Exporting...
        `;

        try {
            const result = await eel.export_shed_matrix_excel(lastInputs)();
            if (result.error) {
                showError("Export failed: " + result.error);
            } else {
                // Trigger file download
                const link = document.createElement("a");
                link.href = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + result.b64data;
                link.download = result.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (err) {
            console.error(err);
            showError("Failed to export Excel.");
        } finally {
            exportBtn.disabled = false;
            exportBtn.innerHTML = `
                <svg class="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export to Excel
            `;
        }
    });

    function showError(msg) {
        errorAlert.innerText = msg;
        errorAlert.classList.remove("hidden");
        resultsContainer.classList.remove("hidden");
    }

    function renderMatrix(data, inputs) {
        matrixHead.innerHTML = "";
        matrixBody.innerHTML = "";
        
        dispLoad.innerText = inputs.load;
        dispHeight.innerText = inputs.pipe_height;

        // Build Header
        const trHead = document.createElement("tr");
        const thCorner = document.createElement("th");
        thCorner.className = "px-4 py-3 border-r dark:border-gray-600 bg-gray-200 dark:bg-gray-800 text-center sticky left-0 z-10 font-bold";
        thCorner.innerHTML = "REQUIRED<br>SPAN";
        trHead.appendChild(thCorner);

        data.long_spans.forEach(lSpan => {
            const thBeam = document.createElement("th");
            thBeam.className = "px-4 py-3 text-center border-b border-r dark:border-gray-600 font-bold text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-800";
            thBeam.innerText = lSpan;
            trHead.appendChild(thBeam);
        });
        matrixHead.appendChild(trHead);

        // Build Rows
        data.rows.forEach(rowData => {
            const tr = document.createElement("tr");
            tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors";
            
            // Row Header (Transverse Span)
            const tdHeader = document.createElement("td");
            tdHeader.className = "px-4 py-2 border-r border-b dark:border-gray-600 font-bold bg-gray-100 dark:bg-gray-800 text-center sticky left-0";
            tdHeader.innerText = rowData.t_span;
            tr.appendChild(tdHeader);

            // Row Cells
            rowData.cells.forEach(cell => {
                // Beam cell
                const tdBeam = document.createElement("td");
                let colorClass = "";
                if (cell.leg === "P3") colorClass = "bg-p3";
                else if (cell.leg === "P3.5") colorClass = "bg-p35";
                else if (cell.leg === "NG") colorClass = "bg-ng";

                tdBeam.className = `px-4 py-3 text-center font-bold border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 ${colorClass}`;
                tdBeam.innerHTML = `
                    <div class="font-bold">${cell.beam}</div>
                    <div class="text-[10px] opacity-75 mt-0.5 font-medium">${cell.p_leg}k</div>
                `;
                tr.appendChild(tdBeam);
            });

            matrixBody.appendChild(tr);
        });

        // Populate Lb Reference Table
        const lbRefBody = document.getElementById("lb-ref-body");
        if (lbRefBody && data.fixed_beams) {
            lbRefBody.innerHTML = "";
            for (const [beam, lb] of Object.entries(data.fixed_beams)) {
                // Formatting "W8X10" -> "W8x10"
                const parts = beam.split('X');
                const formattedName = parts.length === 2 ? `${parts[0]}x${parts[1]}` : beam;

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="px-4 py-2 border-r dark:border-gray-600 font-medium">${formattedName}</td>
                    <td class="px-4 py-2 text-center text-blue-600 dark:text-blue-400 font-bold">${lb}</td>
                `;
                lbRefBody.appendChild(tr);
            }
        }

        resultsContainer.classList.remove("hidden");
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
});
