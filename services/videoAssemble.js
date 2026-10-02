const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;

async function assembleVideo(scenesData, jobDir, jobId) {
  console.log('[VIDEO] Starting hybrid assembly (Google Flow + Ken Burns)...');
  const clipPaths = [];

  for (let i = 0; i < scenesData.length; i++) {
    const scene = scenesData[i];
    const clipPath = path.join(jobDir, `clip_${String(i).padStart(2, '0')}.mp4`);

    if (scene.type === 'ai_video' && scene.videoPath) {
      console.log(`[VIDEO] Using pre-made Google Flow clip for scene ${i + 1}`);
      await fs.copy(scene.videoPath, clipPath);
    } else {
      console.log(`[VIDEO] Generating FREE Ken Burns clip for scene ${i + 1}`);
      await createKenBurnsClip(scene.imagePath, scene.audioPath, clipPath, scene.duration);
    }

    clipPaths.push(clipPath);
  }

  const outputPath = path.join(jobDir, `${jobId}_final.mp4`);
  await concatenateClips(clipPaths, outputPath, jobDir);

  return outputPath;
}

function createKenBurnsClip(imagePath, audioPath, outputPath, duration = 10) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop 1', '-framerate 30'])
      .input(audioPath)
      .videoFilters([
        {
          filter: 'zoompan',
          options: {
            z: 'min(zoom+0.0004,1.5)',
            x: 'iw/2-(iw/zoom/2)',
            y: 'ih/2-(ih/zoom/2)',
            d: '1',
            s: `${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`,
            fps: '30'
          }
        }
      ])
      .outputOptions([
        '-pix_fmt yuv420p',
        '-shortest',
        '-c:v libx264',
        '-preset fast',
        '-c:a aac',
        '-b:a 192k'
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => {
        console.error('[VIDEO] Ken Burns Error:', err.message);
        reject(err);
      })
      .run();
  });
}

async function concatenateClips(clipPaths, outputPath, jobDir) {
  const listPath = path.join(jobDir, 'final_concat_list.txt');
  const listContent = clipPaths.map(p => `file '${p}'`).join('\n');
  await fs.outputFile(listPath, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions([
        '-c:v libx264', 
        '-preset fast',
        '-crf 23',
        '-c:a aac',
        '-b:a 192k',
        '-movflags +faststart',
        '-pix_fmt yuv420p',
        '-r 30',
        '-vf', `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setsar=1`
      ])
      .output(outputPath)
      .on('progress', p => { if (p.percent) console.log(`[VIDEO] Concat: ${Math.round(p.percent)}%`); })
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
}

async function buildVideoSimple(imagePaths, audioPaths, fullAudioPath, jobDir, jobId) {
    throw new Error("Simple fallback not supported in hybrid mode.");
}

module.exports = { assembleVideo, buildVideoSimple };