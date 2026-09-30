const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

// YouTube Shorts: 1080x1920, 9:16, 60fps max
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const SCENE_DURATION = 5; // seconds per scene (adjust based on audio)

async function assembleVideo(imagePaths, audioPaths, fullAudioPath, jobDir, jobId) {
  console.log('[VIDEO] Starting assembly...');

  // Step 1: Get duration of each audio clip to sync scenes
  const durations = await getAudioDurations(audioPaths);
  console.log('[VIDEO] Audio durations:', durations);

  // Step 2: Pad/resize images to 1080x1920
  const processedImages = await processImages(imagePaths, jobDir);
  console.log('[VIDEO] Images processed:', processedImages.length);

  // Step 3: Build video from image slideshow + full audio
  const outputPath = path.join(jobDir, `${jobId}_final.mp4`);
  await buildVideo(processedImages, durations, fullAudioPath, outputPath, jobDir);

  console.log(`[VIDEO] Final video: ${outputPath}`);
  return outputPath;
}

async function processImages(imagePaths, jobDir) {
  const processed = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const outPath = path.join(jobDir, `proc_${String(i).padStart(2, '0')}.png`);
    await sharp(imagePaths[i])
      .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
        fit: 'cover',
        position: 'centre'
      })
      .png()
      .toFile(outPath);
    processed.push(outPath);
  }
  return processed;
}

async function getAudioDurations(audioPaths) {
  const durations = [];
  for (const ap of audioPaths) {
    const dur = await getFileDuration(ap);
    // Add 0.5s padding between scenes
    durations.push(dur + 0.5);
  }
  return durations;
}

function getFileDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || SCENE_DURATION);
    });
  });
}

async function buildVideo(imagePaths, durations, fullAudioPath, outputPath, jobDir) {
  // Write concat demuxer file for images
  const videoListPath = path.join(jobDir, 'video_list.txt');
  let listContent = '';
  imagePaths.forEach((imgPath, i) => {
    listContent += `file '${imgPath}'\nduration ${durations[i].toFixed(2)}\n`;
  });
  // Repeat last image to avoid truncation
  listContent += `file '${imagePaths[imagePaths.length - 1]}'\n`;
  await fs.outputFile(videoListPath, listContent);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();

    // Input 1: image slideshow
    cmd
      .input(videoListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .inputFPS(30);

    // Input 2: full narration audio
    cmd.input(fullAudioPath);

    cmd
      // Ken Burns zoom effect via scale + crop filter
      .complexFilter([
        // Scale up slightly for zoom
        '[0:v]scale=1200:2133,zoompan=z=\'if(lte(zoom,1.0),1.04,max(1.0,zoom-0.002))\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=1:s=1080x1920:fps=30[zoomed]',
        // Add subtle vignette
        '[zoomed]vignette=PI/6[vout]'
      ])
      .outputOptions([
        '-map', '[vout]',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest', // end when audio ends
        '-movflags', '+faststart', // web-optimized
        '-pix_fmt', 'yuv420p',
        '-r', '30'
      ])
      .output(outputPath)
      .on('progress', p => {
        if (p.percent) console.log(`[VIDEO] Encoding: ${Math.round(p.percent)}%`);
      })
      .on('end', () => {
        console.log('[VIDEO] Encode complete');
        resolve(outputPath);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[VIDEO] FFmpeg error:', err.message);
        console.error('[VIDEO] stderr:', stderr);
        reject(err);
      })
      .run();
  });
}

// Simpler fallback: no Ken Burns, just plain slideshow
async function buildVideoSimple(imagePaths, durations, fullAudioPath, outputPath, jobDir) {
  const videoListPath = path.join(jobDir, 'video_list_simple.txt');
  let listContent = '';
  imagePaths.forEach((imgPath, i) => {
    listContent += `file '${imgPath}'\nduration ${durations[i].toFixed(2)}\n`;
  });
  listContent += `file '${imagePaths[imagePaths.length - 1]}'\n`;
  await fs.outputFile(videoListPath, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .input(fullAudioPath)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-vf', `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

module.exports = { assembleVideo, buildVideoSimple };
