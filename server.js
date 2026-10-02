require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');

const { generateImage } = require('./services/imageGen');
const { generateVoiceover } = require('./services/voiceGen');
const { assembleVideo, buildVideoSimple } = require('./services/videoAssemble');

const app = express();
const PORT = process.env.PORT || 3000;
const JOBS_DIR = path.join(__dirname, 'jobs');
const PUBLIC_DIR = path.join(__dirname, 'public');

const jobs = new Map();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use('/videos', express.static(PUBLIC_DIR));
fs.ensureDirSync(JOBS_DIR);
fs.ensureDirSync(PUBLIC_DIR);

app.get('/', (req, res) => {
  res.json({
    service: 'Dollar Double Empire — Shorts Factory',
    version: '1.0.0',
    status: 'running',
    activeJobs: [...jobs.values()].filter(j => j.status === 'processing').length
  });
});

app.post('/generate', async (req, res) => {
  const { title, hook, scenes } = req.body;

  if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ error: 'scenes array is required' });
  }

  const jobId = uuidv4();
  const jobDir = path.join(JOBS_DIR, jobId);
  await fs.ensureDir(jobDir);

  jobs.set(jobId, {
    id: jobId,
    title: title || 'Untitled Short',
    status: 'queued',
    progress: 0,
    step: 'Queued',
    scenes: scenes.length,
    createdAt: new Date().toISOString(),
    completedAt: null,
    videoUrl: null,
    error: null
  });

  res.status(202).json({
    jobId,
    message: 'Video generation started',
    statusUrl: `/status/${jobId}`
  });

  runPipeline(jobId, jobDir, { title, hook, scenes }).catch(err => {
    console.error(`[JOB ${jobId}] Pipeline failed:`, err.message);
    updateJob(jobId, { status: 'failed', error: err.message });
  });
});

app.get('/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.get('/download/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'complete') return res.status(400).json({ error: `Job not complete: ${job.status}` });

  const videoPath = path.join(PUBLIC_DIR, `${req.params.jobId}_final.mp4`);
  if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Video file not found' });

  res.download(videoPath, `${job.title.replace(/[^a-z0-9]/gi, '_')}.mp4`);
});

app.get('/jobs', (req, res) => {
  const list = [...jobs.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
  res.json({ total: jobs.size, jobs: list });
});

async function runPipeline(jobId, jobDir, { title, scenes }) {
  console.log(`\n[JOB ${jobId}] Starting pipeline for: "${title}"`);
  console.log(`[JOB ${jobId}] Scenes: ${scenes.length}`);

  try {
    updateJob(jobId, { status: 'processing', step: 'Generating images...', progress: 5 });
    const imagePaths = await generateImagesParallel(scenes, jobDir, jobId);

    updateJob(jobId, { step: 'Generating voiceover...', progress: 50 });
    const { audioPaths, fullAudioPath } = await generateVoiceover(scenes, jobDir);

    updateJob(jobId, { step: 'Assembling video...', progress: 75 });
    
    const scenesData = scenes.map((scene, index) => ({
      type: scene.type || (scene.useAIVideo ? 'ai_video' : 'ken_burns'),
      imagePath: imagePaths[index],
      audioPath: audioPaths[index],
      videoPath: scene.videoPath || scene.generatedVideoPath || null,
      duration: scene.duration || 10
    }));

    let videoPath;
    try {
      videoPath = await assembleVideo(scenesData, jobDir, jobId);
    } catch (videoErr) {
      console.warn(`[JOB ${jobId}] Advanced assembly failed:`, videoErr.message);
      throw videoErr;
    }

    updateJob(jobId, { step: 'Finalizing...', progress: 95 });
    const publicPath = path.join(PUBLIC_DIR, `${jobId}_final.mp4`);
    await fs.move(videoPath, publicPath, { overwrite: true });

    await fs.remove(jobDir);

    const videoUrl = `${process.env.RAILWAY_PUBLIC_URL || `http://localhost:${PORT}`}/videos/${jobId}_final.mp4`;
    updateJob(jobId, {
      status: 'complete',
      step: 'Done!',
      progress: 100,
      videoUrl,
      completedAt: new Date().toISOString()
    });

    console.log(`[JOB ${jobId}] ✅ Complete: ${videoUrl}`);

  } catch (err) {
    console.error(`[JOB ${jobId}] ❌ Error at step "${jobs.get(jobId)?.step}":`, err.message);
    updateJob(jobId, {
      status: 'failed',
      step: `Failed: ${err.message}`,
      error: err.message
    });
    await fs.remove(jobDir).catch(() => {});
    throw err;
  }
}

async function generateImagesParallel(scenes, jobDir, jobId) {
  const CONCURRENCY = 3;
  const results = new Array(scenes.length);
  const queue = [...scenes.entries()];

  const worker = async () => {
    while (queue.length > 0) {
      const [i, scene] = queue.shift();
      
      if (scene.type === 'ai_video' || scene.useAIVideo) {
        results[i] = null;
        console.log(`[IMG] Skipping scene ${scene.num} (pre-made video)`);
        continue;
      }
      
      results[i] = await generateImage(scene.visual, scene.num, jobDir);
      const pct = 5 + Math.round(((scenes.length - queue.length) / scenes.length) * 40);
      updateJob(jobId, { progress: pct, step: `Generating images (${scenes.length - queue.length}/${scenes.length})...` });
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

function updateJob(jobId, updates) {
  const job = jobs.get(jobId);
  if (job) jobs.set(jobId, { ...job, ...updates });
}

app.listen(PORT, () => {
  console.log(`\n🎬 Shorts Factory Backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/`);
  console.log(`   Env check:`);
  console.log(`   REPLICATE_API_TOKEN: ${process.env.REPLICATE_API_TOKEN ? '✅' : '❌ MISSING'}`);
  console.log(`   ELEVENLABS_API_KEY:  ${process.env.ELEVENLABS_API_KEY ? '✅' : '❌ MISSING'}`);
  console.log(`   RAILWAY_PUBLIC_URL:  ${process.env.RAILWAY_PUBLIC_URL || '⚠️  not set (OK for local)'}\n`);
});