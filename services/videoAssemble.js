const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;

async function assembleVideo(imagePaths, audioPaths, fullAudioPath, jobDir, jobId) {
  console.log('[VIDEO] Starting assembly...');
  const durations = await getAudioDurations(audioPaths);
  const outputPath = path.join(jobDir, `${jobId}_final.mp4`);
  await buildVideo(imagePaths, durations, fullAudioPath, outputPath, jobDir);
  return outputPath;
}

async function getAudioDurations(audioPaths) {
  const durations = [];
  for (const ap of audioPaths) {
    const dur = await getFileDuration(ap);
    durations.push(Math.max(dur + 0.5, 2));
  }
  return durations;
}

function getFileDuration(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return resolve(4);
      resolve(metadata.format.duration || 4);
    });
  });
}

async function buildVideo(imagePaths, durations, fullAudioPath, outputPath, jobDir) {
  const listPath = path.join(jobDir, 'video_list.txt');
  let content = '';
  imagePaths.forEach((imgPath, i) => {
    content += `file '${imgPath}'\nduration ${durations[i].toFixed(2)}\n`;
  });
  content += `file '${imagePaths[imagePaths.length - 1]}'\n`;
  await fs.outputFile(listPath, content);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .input(fullAudioPath)
      .outputOptions([
        '-vf', `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setsar=1`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        '-r', '30'
      ])
      .output(outputPath)
      .on('progress', p => { if (p.percent) console.log(`[VIDEO] ${Math.round(p.percent)}%`); })
      .on('end', () => resolve(outputPath))
      .on('error', (err, stdout, stderr) => { console.error('[VIDEO]', err.message); reject(err); })
      .run();
  });
}

async function buildVideoSimple(imagePaths, audioPaths, fullAudioPath, jobDir, jobId) {
  return assembleVideo(imagePaths, audioPaths, fullAudioPath, jobDir, jobId);
}

module.exports = { assembleVideo, buildVideoSimple };
