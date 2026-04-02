#! /usr/bin/env bun

/**
 * @fileoverview Speed Test - Single file executable
 * Accurate: Uses dedicated CDN edge endpoints, fixed duration testing, and high precision timing
 * 
 * @author Andrew Velez <andrewvelez@outlook.com>
 * @license MIT
 */

const CONFIG = {
  duration: 10, // seconds to run each test
  downUrl: 'https://speed.cloudflare.com/__down?bytes=',
  upUrl: 'https://speed.cloudflare.com/__up',
};

async function testDownload() {
  console.log('📥 Testing download speed...');

  // Request a massive file (500MB) to prevent finishing too early, 
  // but we will safely abort it once our duration is hit.
  const url = CONFIG.downUrl + (500 * 1024 * 1024);
  const start = performance.now();
  let totalBytes = 0;
  let lastUpdate = start;

  const response = await fetch(url);
  const reader = response.body?.getReader();

  if (!reader) throw new Error('No response body');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.length;

    const now = performance.now();
    const elapsed = (now - start) / 1000;

    // Show progress roughly every second
    if (now - lastUpdate >= 1000) {
      const mbps = (totalBytes * 8) / elapsed / 1e6;
      const progress = Math.min((elapsed / CONFIG.duration) * 100, 100);
      process.stdout.write(`\r   ${mbps.toFixed(1)} Mbps - ${progress.toFixed(0)}%\x1b[K`);
      lastUpdate = now;
    }

    // Stop reading once we reach the test duration
    if (elapsed >= CONFIG.duration) {
      await reader.cancel();
      break;
    }
  }

  const elapsed = (performance.now() - start) / 1000;
  const mbps = (totalBytes * 8) / elapsed / 1e6;

  console.log(`\r   ✅ ${mbps.toFixed(1)} Mbps (${(totalBytes / 1e6).toFixed(1)} MB in ${elapsed.toFixed(1)}s)\x1b[K`);
  return mbps;
}

async function testUpload() {
  console.log('📤 Testing upload speed...');

  // 2MB chunks: large enough to mitigate HTTP round-trip latency overhead, 
  // but small enough to complete and update progress on slower connections.
  const chunk = new Uint8Array(2 * 1024 * 1024);
  crypto.getRandomValues(chunk);

  let totalBytes = 0;
  const start = performance.now();
  let lastUpdate = start;

  while (true) {
    const elapsedTotal = (performance.now() - start) / 1000;
    if (elapsedTotal >= CONFIG.duration) break;

    const response = await fetch(CONFIG.upUrl, {
      method: 'POST',
      body: chunk,
      headers: { 'Content-Type': 'application/octet-stream' }
    });

    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
    await response.arrayBuffer(); // Consume response to free memory

    totalBytes += chunk.length;
    const now = performance.now();
    const elapsed = (now - start) / 1000;

    if (now - lastUpdate >= 1000 || elapsed >= CONFIG.duration) {
      const mbps = (totalBytes * 8) / elapsed / 1e6;
      const progress = Math.min((elapsed / CONFIG.duration) * 100, 100);
      process.stdout.write(`\r   ${mbps.toFixed(1)} Mbps - ${progress.toFixed(0)}%\x1b[K`);
      lastUpdate = now;
    }
  }

  const elapsed = (performance.now() - start) / 1000;
  const mbps = (totalBytes * 8) / elapsed / 1e6;
  console.log(`\r   ✅ ${mbps.toFixed(1)} Mbps (${(totalBytes / 1e6).toFixed(1)} MB in ${elapsed.toFixed(1)}s)\x1b[K`);
  return mbps;
}

async function testLatency() {
  console.log('🏓 Testing latency...');
  const latencies: number[] = [];

  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await fetch('https://cloudflare.com/cdn-cgi/trace', { method: 'HEAD' });
    const latency = performance.now() - start;
    latencies.push(latency);

    process.stdout.write(`\r   ${latency.toFixed(0)}ms \x1b[K`);
    await Bun.sleep(500);
  }

  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  console.log(`\r   ✅ Avg: ${avg.toFixed(0)}ms (min: ${Math.min(...latencies).toFixed(0)}ms, max: ${Math.max(...latencies).toFixed(0)}ms)\x1b[K`);
  return avg;
}

async function main() {
  console.log('\n🚀 SPEED TEST\n' + '═'.repeat(40));

  try {
    const latency = await testLatency();
    console.log('');
    const download = await testDownload();
    console.log('');
    const upload = await testUpload();

    console.log('\n' + '═'.repeat(40));
    console.log('📊 RESULTS:');
    console.log(`   Latency:  ${latency.toFixed(0)} ms (avg)`);
    console.log(`   Download: ${download.toFixed(1)} Mbps`);
    console.log(`   Upload:   ${upload.toFixed(1)} Mbps`);

    // Modern quality assessment (Based on 2024+ FCC broadband definitions)
    if (download >= 500) {
      console.log('\n   ⚡ Excellent connection (Gigabit-class)');
    } else if (download >= 100 && upload >= 20) {
      console.log('\n   👍 Good connection (Meets modern broadband standards)');
    } else if (download >= 25) {
      console.log('\n   📱 Adequate connection (Basic web browsing & standard HD streaming)');
    } else {
      console.log('\n   ⚠️  Slow connection (Below standard minimums)');
    }

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

await main();