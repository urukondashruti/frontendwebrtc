"use client"

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';

export default function Home() {
    const [connection, setConnection] = useState(false);
    const [file, setFile] = useState(null);
    const [sendProgress, setSendProgress] = useState(0);
    const [receiveProgress, setReceiveProgress] = useState(0);
    const [gotFile, setGotFile] = useState(false);
    const fileNameRef = useRef();
    const workerRef = useRef();
    const totalFileSizeRef = useRef(0);
    const totalReceivedFileSizeRef = useRef(0); // Define totalReceivedFileSize as a ref
    const socketRef = useRef();
    const peerRef = useRef();
    const roomID = 'test';

    useEffect(() => {
        workerRef.current = new Worker(
            new URL('../utils/worker.js', import.meta.url)
        );
        socketRef.current = io.connect('http://localhost:8000');
        socketRef.current.emit('join room', roomID);
        
        socketRef.current.on('user conencted', (userId) => {
            peerRef.current = createPeer(userId, socketRef.current.id);
        });

        socketRef.current.on('user joined', (payload) => {
            peerRef.current = addPeer(payload.signal, payload.callerID);
        });

        socketRef.current.on('receiving returned signal', (payload) => {
            peerRef.current.signal(payload.signal);
            setConnection(true);
        });
    }, []);

    function createPeer(target, callerID) {
        const peer = new Peer({ initiator: true, trickle: false });

        peer.on('signal', (signal) => {
            socketRef.current.emit('sending signal', { target, callerID, signal });
        });

        peer.on('data', handleReceivingData);

        return peer;
    }

    function addPeer(incomingSignal, callerID) {
        const peer = new Peer({ initiator: false, trickle: false });

        peer.on('signal', (signal) => {
            socketRef.current.emit('returning signal', { signal, target: callerID });
        });

        peer.on('data', handleReceivingData);

        peer.signal(incomingSignal);
        setConnection(true);
        return peer;
    }

    function handleReceivingData(data) {
        console.log("received")
        console.log(receiveProgress)
        const worker = workerRef.current;

        if (data.toString().includes('done')) {
            const parsed = JSON.parse(data);
            fileNameRef.current = parsed.fileName;
            setReceiveProgress(100);
            setGotFile(true);
            totalReceivedFileSizeRef.current = 0;
        } else if (data.toString().includes('fileSize')) {
            const parsed = JSON.parse(data.toString());
            setGotFile(true);
            if (parsed.fileSize) {
                totalReceivedFileSizeRef.current = 0; // Reset total received size
                totalFileSizeRef.current = parsed.fileSize; // Set total file size
                worker.postMessage({ fileSize: parsed.fileSize }); // Send size to worker
                setReceiveProgress(0); // Initialize progress
            }
        } else {
            setGotFile(true);
            const receivedBytes = data.byteLength;
            totalReceivedFileSizeRef.current += receivedBytes;
            worker.postMessage(data);

            // Update receiving progress
            setReceiveProgress(
                Math.min((totalReceivedFileSizeRef.current / totalFileSizeRef.current) * 100, 100)
            );
        }
    }

    const download = () => {
        setGotFile(false);
        const worker = workerRef.current;
        worker.postMessage('download');
        worker.addEventListener('message', (event) => {
            const link = document.createElement('a');
            link.href = event.data;
            link.download = fileNameRef.current || 'download';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(event.data);
        });
    };

    const selectFile = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
        } else {
            console.error("No file selected.");
        }
    };

    const sendFile = () => {
        if (!file) {
            console.error("No file selected to send.");
            return;
        }
    
        const CHUNK_SIZE = 16384;
        const peer = peerRef.current;
        let offset = 0;
    
        // Send the file size and name first
        peer.write(JSON.stringify({ fileSize: file.size, fileName: file.name }));
    
        function handleReading() {
            const fileReader = new FileReader();
    
            fileReader.onload = (event) => {
                const chunk = Buffer.from(event.target.result);
                peer.write(chunk);
                offset += chunk.length;
                setSendProgress((offset / file.size) * 100);
    
                if (offset < file.size) {
                    readSlice(offset);
                } else {
                    peer.write(JSON.stringify({ done: true }));
                    setSendProgress(100);
                }
            };
    
            function readSlice(offset) {
                const blob = file.slice(offset, offset + CHUNK_SIZE);
                fileReader.readAsArrayBuffer(blob);
            }
    
            readSlice(0);
        }
    
        handleReading();
    };

    return (
        <main>
            {connection && (
                <div>
                    <input onChange={selectFile} type="file" />
                    <button onClick={sendFile}>Send File</button>
                    <div>Sending Progress: {sendProgress.toFixed(2)}%</div>
                </div>
            )}
            {gotFile && (
                <div>
                    <p>File received: {fileNameRef.current}</p>
                    <button onClick={download}>Download</button>
                    <div>Receiving Progress: {receiveProgress.toFixed(2)}%</div>
                </div>
            )}
        </main>
    );
}  
