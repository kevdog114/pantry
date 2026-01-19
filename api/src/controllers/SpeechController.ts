import { Request, Response } from 'express';
import * as net from 'net';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';

const WHISPER_HOST = process.env.WHISPER_HOST || 'localhost';
const WHISPER_PORT = parseInt(process.env.WHISPER_PORT || '10300', 10);

export const transcribe = async (req: Request, res: Response) => {
    if (!req.files || !req.files.audio) {
        return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioFile = req.files.audio as any;
    const tempFilePath = audioFile.tempFilePath;
    const outputFilePath = path.join(path.dirname(tempFilePath), `converted_${path.basename(tempFilePath)}.pcm`);

    try {
        // Convert audio to 16kHz, 16-bit, mono PCM (s16le)
        await new Promise<void>((resolve, reject) => {
            ffmpeg(tempFilePath)
                .toFormat('s16le')
                .audioFrequency(16000)
                .audioChannels(1)
                .on('error', (err) => reject(err))
                .on('end', () => resolve())
                .save(outputFilePath);
        });

        // Read the converted audio
        const pcmBuffer = fs.readFileSync(outputFilePath);

        // Connect to Wyoming Whisper service
        const client = new net.Socket();

        let transcript = '';
        let errorString = '';

        client.connect(WHISPER_PORT, WHISPER_HOST, () => {
            // Send Audio Start
            const startMsg = JSON.stringify({
                type: 'audio-start',
                data: {
                    rate: 16000,
                    width: 2,
                    channels: 1
                }
            }) + '\n';
            client.write(startMsg);

            // Send Audio Chunk
            // Setup chunking if needed, but for short commands, one chunk is fine usually.
            // Max chunk size is safe to keep reasonable, e.g. 1024 bytes, or send all at once if small.
            // Wyoming protocol expects: JSON header + payload.

            const chunkHeader = JSON.stringify({
                type: 'audio-chunk',
                data: {
                    rate: 16000,
                    width: 2,
                    channels: 1
                },
                payload_length: pcmBuffer.length
            }) + '\n';

            client.write(chunkHeader);
            client.write(pcmBuffer);

            // Send Audio Stop
            const stopMsg = JSON.stringify({
                type: 'audio-stop'
            }) + '\n';
            client.write(stopMsg);
        });

        client.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    if (msg.type === 'transcript') {
                        transcript = msg.data.text;
                        // Assuming non-streaming or final result after audio-stop
                        client.end();
                    }
                } catch (e) {
                    // Ignore non-JSON or partial lines
                }
            }
        });

        client.on('end', () => {
            cleanup();
            res.json({ text: transcript });
        });

        client.on('error', (err) => {
            console.error('Whisper socket error:', err);
            errorString = err.message;
            cleanup();
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to communicate with Speech service', details: err.message });
            }
        });

        // Timeout handling? 
        // Wyoming whisper usually closes connection after sending transcript?
        // Actually it might stay open. We should probably wait for transcript and then end?
        // Or normally server sends transcript then we can close?
        // "event": "transcript"
        // Let's modify logic to close after transcript received or wait for server close.
        // Usually server sends transcript then expects more or we can close.
        // But let's assume one-shot for now.

    } catch (err) {
        console.error('Transcription error:', err);
        res.status(500).json({ error: 'Transcription failed' });
        // Cleanup temp files
        try {
            if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);
        } catch (e) { }
    }

    function cleanup() {
        try {
            if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);
        } catch (e) { }
    }
};
