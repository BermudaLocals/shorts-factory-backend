const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const ELEVEN_API = 'https://api.elevenlabs.io/v1';

// Default voice: "Rachel" — warm, friendly, perfect for kids content
// Override with ELEVENLABS_VOICE_ID env var
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

async function generateVoiceover(scenes, jobDir) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const audioPaths = [];

  for (const scene of scenes) {
    console.log(`[VOICE] Generating audio for scene ${scene.num}...`);

    const narration = scene.narration.replace(/"/g, ''); // strip quotes
    const audioPath = path.join(jobDir, `voice_${String(scene.num).padStart(2, '0')}.mp3`);

    await generateClip(narration, voiceId, audioPath);
    audioPaths.push(audioPath);
    console.log(`[VOICE] Scene ${scene.num} audio done`);
  }

  // Concatenate all clips into one audio file using ffmpeg concat
  const fullAudioPath = path.join(jobDir, 'full_narration.mp3');
  await concatenateAudio(audioPaths, fullAudioPath, jobDir);

  return { audioPaths, fullAudioPath };
}

async function generateClip(text, voiceId, outputPath) {
  const res = await axios.post(
    `${ELEVEN_API}/text-to-speech/${voiceId}`,
    {
      text,
      model_id: 'eleven_turbo_v2', // Fast + cheap
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.85,
        style: 0.3,
        use_speaker_boost: true
      }
    },
    {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      responseType: 'arraybuffer'
    }
  );

  await fs.outputFile(outputPath, Buffer.from(res.data));
}

async function concatenateAudio(audioPaths, outputPath, jobDir) {
  const ffmpeg = require('fluent-ffmpeg');

  // Write concat list
  const listPath = path.join(jobDir, 'audio_list.txt');
  const listContent = audioPaths.map(p => `file '${p}'`).join('\n');
  await fs.outputFile(listPath, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

module.exports = { generateVoiceover };
