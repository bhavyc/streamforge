const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');

if (ffmpegInstaller.path) {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
}

const samplesDir = path.join(__dirname, '..', 'samples');
if (!fs.existsSync(samplesDir)) {
  fs.mkdirSync(samplesDir, { recursive: true });
}

const outputPath = path.join(samplesDir, 'test-sample.mp4');

console.log('Generating test video pattern at:', outputPath);

// Generate 5-second 1280x720 video with test patterns and 440Hz tone
ffmpeg()
  .input('testsrc=duration=5:size=1280x720:rate=30')
  .inputFormat('lavfi')
  .input('sine=frequency=440:duration=5')
  .inputFormat('lavfi')
  .outputOptions([
    '-c:v libx264',
    '-pix_fmt yuv420p',
    '-c:a aac',
    '-shortest',
  ])
  .output(outputPath)
  .on('end', () => {
    const stats = fs.statSync(outputPath);
    console.log(`Successfully generated sample video!`);
    console.log(`Size: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`Path: ${outputPath}`);
    process.exit(0);
  })
  .on('error', (err) => {
    console.error('Error generating sample:', err.message);
    process.exit(1);
  })
  .run();
