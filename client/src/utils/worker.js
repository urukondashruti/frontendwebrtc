let totalChunks; // Number of chunks expected
let array = []; // Array to hold received chunks
let receivedChunks = 0;

self.addEventListener('message', (event) => {
    if (event.data === 'download') {
        const blob = new Blob(array);
        const blobURL = URL.createObjectURL(blob);
        self.postMessage(blobURL);
        array = [];
    } else if (typeof event.data === 'object' && event.data.fileSize) {
        // Set totalChunks based on received file size
        totalChunks = Math.ceil(event.data.fileSize / 16384);
    } else {
        array.push(event.data);
        receivedChunks++;
        
        // Calculate and send progress
        const progress = (receivedChunks / totalChunks) * 100;
        self.postMessage({ progress });
    }
}); 