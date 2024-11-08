"use client"

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import './styles.css'; // Import normal CSS file

export default function Home() {
  const [connection, setConnection] = useState(false);
  const [file, setFile] = useState([]); // Changed to an array to hold multiple files if necessary
  const [sendProgress, setSendProgress] = useState(0);
  const [receiveProgress, setReceiveProgress] = useState(0);
  const [gotFile, setGotFile] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const fileNameRef = useRef();
  const fileInputRef = useRef(null); // Ref for the file input
  const workerRef = useRef();
  const totalFileSizeRef = useRef(0);
  const totalReceivedFileSizeRef = useRef(0);
  const socketRef = useRef();
  const peerRef = useRef();
  const roomID = 'test';

  useEffect(() => {
    workerRef.current = new Worker(new URL('../utils/worker.js', import.meta.url));
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
        totalReceivedFileSizeRef.current = 0;
        totalFileSizeRef.current = parsed.fileSize;
        fileNameRef.current = parsed.fileName;
        worker.postMessage({ fileSize: parsed.fileSize });
        setReceiveProgress(0);
      }
    } else {
      setGotFile(true);
      const receivedBytes = data.byteLength;
      totalReceivedFileSizeRef.current += receivedBytes;
      worker.postMessage(data);

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
      setFile([selectedFile]); // Changed to array since your initial state was an array
    } else {
      console.error("No file selected.");
    }
  };

  const sendFile = () => {
    if (!file.length) {
      console.error("No file selected to send.");
      return;
    }
    const firstFile = file[0]; // Use the first file in the array
    setIsSending(true);
    const CHUNK_SIZE = 16384;
    const peer = peerRef.current;
    let offset = 0;

    // Send the file size and name first
    peer.write(JSON.stringify({ fileSize: firstFile.size, fileName: firstFile.name }));

    function handleReading() {
      const fileReader = new FileReader();

      fileReader.onload = (event) => {
        const chunk = Buffer.from(event.target.result);
        peer.write(chunk);
        offset += chunk.length;
        setSendProgress((offset / firstFile.size) * 100);

        if (offset < firstFile.size) {
          readSlice(offset);
        } else {
          peer.write(JSON.stringify({ done: true, fileName: firstFile.name }));
          setSendProgress(100);
          setIsSending(false);
        }
      };

      function readSlice(offset) {
        const blob = firstFile.slice(offset, offset + CHUNK_SIZE);
        fileReader.readAsArrayBuffer(blob);
      }

      readSlice(0);
    }

    handleReading();
  };

  return (
    <main className="main-container">
      {connection && (
        <div className="send-file-container">
          <h2 className="title">Send a File</h2>
          <input
            ref={fileInputRef} // Attach ref to the file input
            onChange={selectFile}
            type="file"
            className="file-input"
          />
          <button
            onClick={sendFile}
            disabled={!file.length || isSending}
            className="button"
          >
            {isSending ? `Sending... ${sendProgress.toFixed(2)}%` : "Send File"}
          </button>
        </div>
      )}
      {gotFile && (
        <div className="received-file-container">
          <h2 className="title">File Received</h2>
          <p className="progress-text">
            {`Download progress: ${receiveProgress.toFixed(2)}%`}
          </p>
          <button onClick={download} className="download-button">
            Download {fileNameRef.current || 'File'}
          </button>
        </div>
      )}
    </main>
  );
}
