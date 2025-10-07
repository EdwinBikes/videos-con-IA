/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from "@google/genai";

// State variables
let imageBase64: string | null = null;
let imageMimeType: string | null = null;
let resultUrl: string | null = null;
let currentMode: 'edit' | 'video' = 'edit';
let loadingInterval: number | undefined;

// DOM element references
const imageUpload = document.getElementById('image-upload') as HTMLInputElement;
const originalImage = document.getElementById('original-image') as HTMLImageElement;
const uploadPlaceholder = document.getElementById('upload-placeholder') as HTMLParagraphElement;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const promptExamples = document.getElementById('prompt-examples') as HTMLSelectElement;
const actionButton = document.getElementById('action-button') as HTMLButtonElement;
const resultContainer = document.getElementById('result-container') as HTMLDivElement;
const resultPlaceholder = document.getElementById('result-placeholder') as HTMLParagraphElement;
const loader = document.getElementById('loader') as HTMLDivElement;
const downloadButton = document.getElementById('download-button') as HTMLButtonElement;
const modeEditRadio = document.getElementById('mode-edit') as HTMLInputElement;
const modeVideoRadio = document.getElementById('mode-video') as HTMLInputElement;

// Set the initial prompt from the user's request
promptInput.value = 'modifica la imagen y dale un aspecto profesional, donde los colores destaquen y resalten lo mejor de la fotografia';

// Event listener for mode selection
modeEditRadio.addEventListener('change', () => {
    if (modeEditRadio.checked) {
        currentMode = 'edit';
        actionButton.textContent = 'Editar Imagen';
        downloadButton.textContent = 'Descargar Imagen';
    }
});

modeVideoRadio.addEventListener('change', () => {
    if (modeVideoRadio.checked) {
        currentMode = 'video';
        actionButton.textContent = 'Crear Video';
        downloadButton.textContent = 'Descargar Video';
    }
});

// Event listener for the example prompts dropdown
promptExamples.addEventListener('change', (event) => {
    const selectedValue = (event.target as HTMLSelectElement).value;
    if (selectedValue) {
        promptInput.value = selectedValue;
    }
});

// Event listener for the file input
imageUpload.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
        return;
    }

    try {
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            const dataUrlParts = result.split(',');
            if (dataUrlParts.length !== 2) {
                throw new Error('Invalid data URL format');
            }
            const mimeTypePart = dataUrlParts[0].split(':')[1].split(';')[0];
            
            imageBase64 = dataUrlParts[1];
            imageMimeType = mimeTypePart;

            originalImage.src = result;
            originalImage.style.display = 'block';
            uploadPlaceholder.classList.add('hidden');
            actionButton.disabled = false;
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('Error reading file:', error);
        alert('No se pudo leer el archivo seleccionado. Por favor, intenta con otra imagen.');
    }
});

// Event listener for the main action button
actionButton.addEventListener('click', async () => {
    if (!imageBase64 || !imageMimeType) {
        alert('Por favor, sube una imagen primero.');
        return;
    }

    const prompt = promptInput.value;
    if (!prompt.trim()) {
        alert('Por favor, ingresa una instrucción.');
        return;
    }
    
    resultPlaceholder.classList.add('hidden');

    if (currentMode === 'edit') {
        await editImageWithGemini(prompt, imageBase64, imageMimeType);
    } else {
        await generateVideoWithGemini(prompt, imageBase64, imageMimeType);
    }
});

// Event listener for the download button
downloadButton.addEventListener('click', () => {
    if (!resultUrl) {
        alert('No hay resultado para descargar.');
        return;
    }

    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = currentMode === 'edit' ? 'imagen-editada.png' : 'video-generado.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

// Function to call Gemini for Image Editing
async function editImageWithGemini(prompt: string, base64Data: string, mimeType: string) {
    setLoading(true);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { data: base64Data, mimeType: mimeType } },
                    { text: prompt },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        
        resultContainer.innerHTML = ''; // Clear loader

        if (response.candidates && response.candidates.length > 0) {
            let foundContent = false;
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const img = document.createElement('img');
                    const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    img.src = imageUrl;
                    img.alt = prompt;
                    resultContainer.appendChild(img);
                    
                    resultUrl = imageUrl;
                    downloadButton.classList.remove('hidden');
                    foundContent = true;
                } else if (part.text) {
                    const p = document.createElement('p');
                    p.textContent = part.text;
                    p.className = 'model-text';
                    resultContainer.appendChild(p);
                    foundContent = true;
                }
            }
            if (!foundContent) {
                displayError('El modelo no devolvió ningún contenido.');
            }
        } else {
            displayError('No hubo respuesta del modelo. Por favor, inténtalo de nuevo.');
        }

    } catch (error) {
        console.error("Error calling Gemini API for image editing:", error);
        displayError('Ocurrió un error en la edición. Por favor, revisa la consola.');
    } finally {
        setLoading(false);
    }
}

// Function to call Gemini for Video Generation
async function generateVideoWithGemini(prompt: string, base64Data: string, mimeType: string) {
    const loadingMessages = [
        "Iniciando la generación de video...",
        "El modelo está imaginando tu escena...",
        "Renderizando los fotogramas (esto puede tardar unos minutos)...",
        "Aplicando los toques finales...",
        "Casi listo, ¡la espera valdrá la pena!"
    ];
    setLoading(true, loadingMessages[0]);
    let messageIndex = 0;
    loadingInterval = window.setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        const loaderText = document.getElementById('loader-text');
        if (loaderText) {
            loaderText.textContent = loadingMessages[messageIndex];
        }
    }, 5000);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        let operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: prompt,
            image: { imageBytes: base64Data, mimeType: mimeType },
            config: { numberOfVideos: 1 }
        });

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (downloadLink) {
            // The response.body contains the MP4 bytes. You must append an API key when fetching from the download link.
            const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
            const videoBlob = await videoResponse.blob();
            const videoBlobUrl = URL.createObjectURL(videoBlob);
            
            resultContainer.innerHTML = '';
            const video = document.createElement('video');
            video.src = videoBlobUrl;
            video.controls = true;
            video.autoplay = true;
            video.loop = true;
            video.muted = true; // Required for autoplay in many browsers
            resultContainer.appendChild(video);

            resultUrl = videoBlobUrl;
            downloadButton.classList.remove('hidden');

        } else {
            displayError('No se pudo generar el video. Inténtalo de nuevo.');
        }

    } catch (error) {
        console.error("Error calling Gemini API for video generation:", error);
        displayError('Ocurrió un error en la generación del video. Por favor, revisa la consola.');
    } finally {
        setLoading(false);
    }
}

function setLoading(isLoading: boolean, message: string | null = null) {
    if (loadingInterval) {
        clearInterval(loadingInterval);
        loadingInterval = undefined;
    }

    if (isLoading) {
        resultContainer.innerHTML = '';
        downloadButton.classList.add('hidden');
        resultUrl = null;

        loader.classList.remove('hidden');
        resultContainer.appendChild(loader);
        if (message) {
            const loaderText = document.createElement('p');
            loaderText.id = 'loader-text';
            loaderText.textContent = message;
            resultContainer.appendChild(loaderText);
        }
        actionButton.disabled = true;
    } else {
        loader.classList.add('hidden');
        actionButton.disabled = false;
    }
}

function displayError(message: string) {
    resultContainer.innerHTML = '';
    const errorP = document.createElement('p');
    errorP.textContent = message;
    errorP.className = 'error';
    resultContainer.appendChild(errorP);
    downloadButton.classList.add('hidden');
}