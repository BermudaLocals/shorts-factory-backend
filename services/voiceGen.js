const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

async function generateVoiceover(scenes, jobDir) {
  const audioPaths = [];
  for (const scene of scenes) {
    if (scene.type === 'ai_video' || scene.useAIVideo) {
      audioPaths.push(null);
      continue;
      }
    console.log(`[VOICE] Generating audio for scene ${scene.num}...`);
    const audioPath = path.join(jobDir, `voice_${String(scene.num).padStart(2, '0')}.mp3`);
    await generateEdgeTTS(scene.narration, audioPath);
    audioPaths.push(audioPath);
  }
  const validAudioPaths = audioPaths.filter(p => p !== null);
  const fullAudioPath = path.join(jobDir, 'full_narration.mp3');
  await concatenateAudio(validAudioPaths, fullAudioPath, jobDir);
  return { audioPaths, fullAudioPath };
}

async function generateEdgeTTS(text, outputPath) {
  return new Promise((resolve, reject) => {
    const command = `edge-tts --voice "en-US-JennyNeural" --text "${text.replace(/"/g, '\\"')}" --write-media "${outputPath}"`;
    exec(command, (error) => error ? reject(error) : resolve(outputPath));
  });
}

async function concatenateAudio(audioPaths, outputPath, jobDir) {
  const ffmpeg = require('fluent-ffmpeg');
  const listPath = path.join(jobDir, 'audio_list.txt');
  await fs.outputFile(listPath, audioPaths.map(p => `file '${p}'`).join('\n'));
  return new Promise((resolve, reject) => {
    ffmpeg().input(listPath).inputOptions(['-f', 'concat', '-safe', '0'])
      .audioCodec('libmp3lame').audioBitrate('128k').output(outputPath)
      .on('end', resolve).on('error', reject).run();
  });
}
module.exports = { generateVoiceover };