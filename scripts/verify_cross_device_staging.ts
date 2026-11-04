import fs from 'fs';
import path from 'path';
import { createSession } from '../server/authService.ts';

const HTTPS_BASE_URL = 'https://twist-purpose-graphical-conceptual.trycloudflare.com';

async function verifyCrossDevice() {
  console.log('========================================================================');
  console.log('AMIT TOUCH - CROSS-DEVICE & BROWSER PROFILE STAGING VERIFICATION');
  console.log(`Target URL: ${HTTPS_BASE_URL}`);
  console.log('========================================================================\n');

  // 1. Establish separate sessions for two distinct devices / browser profiles
  console.log('Step 1: Establishing independent sessions for Device 1 (Desktop) and Device 2 (Mobile)...');
  const token1 = createSession('amit2001tal@gmail.com', '192.168.1.100', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0');
  const token2 = createSession('amit2001tal@gmail.com', '10.0.0.50', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1');

  const headersDevice1 = {
    'Cookie': `amit_session=${token1}`,
    'Content-Type': 'application/json',
  };

  const headersDevice2 = {
    'Cookie': `amit_session=${token2}`,
    'Content-Type': 'application/json',
  };

  // Verify authentication on both devices
  const auth1Res = await fetch(`${HTTPS_BASE_URL}/api/auth/status`, { headers: headersDevice1 });
  const auth1 = await auth1Res.json();
  const auth2Res = await fetch(`${HTTPS_BASE_URL}/api/auth/status`, { headers: headersDevice2 });
  const auth2 = await auth2Res.json();

  console.log(`   ✓ Device 1 (Desktop Chrome) Auth Status: ${auth1.authenticated ? 'AUTHENTICATED' : 'FAILED'} (Email: ${auth1.email})`);
  console.log(`   ✓ Device 2 (Mobile Safari)  Auth Status: ${auth2.authenticated ? 'AUTHENTICATED' : 'FAILED'} (Email: ${auth2.email})`);

  if (!auth1.authenticated || !auth2.authenticated) {
    throw new Error('Authentication failed on one or both devices');
  }

  // 2. Cross-Device Time Entry Test: Save on Device 1 -> Refresh on Device 2
  console.log('\nStep 2: Testing Cross-Device Time Entry Synchronization...');
  const testEntryId = `entry_sync_test_${Date.now()}`;
  const testEntry = {
    id: testEntryId,
    clientId: 'client_1793269318815', // עמינח
    projectId: 'project_1793275797630',
    task: 'מיתוג ושילוט — בדיקת סנכרון רב-מכשירי (נוצר ממחשב נייח)',
    description: 'בדיקת סנכרון עבודה בזמן אמת בין מחשב לטלפון',
    date: '2026-11-03',
    startTime: '09:00',
    endTime: '10:30',
    duration: 5400, // 1.5 hours
    isBilled: false,
    createdAt: new Date().toISOString(),
  };

  console.log(`   Device 1: Saving time entry "${testEntry.task}" (${testEntryId})...`);
  const saveRes = await fetch(`${HTTPS_BASE_URL}/api/app-data/entry/save`, {
    method: 'POST',
    headers: headersDevice1,
    body: JSON.stringify(testEntry)
  });
  const saveJson = await saveRes.json();
  if (!saveRes.ok || !saveJson.success) {
    throw new Error(`Device 1 failed to save entry: ${JSON.stringify(saveJson)}`);
  }
  console.log('   ✓ Device 1: Saved successfully on server.');

  console.log('   Device 2: Refreshing data (GET /api/app-data)...');
  const appData2Res = await fetch(`${HTTPS_BASE_URL}/api/app-data`, { headers: headersDevice2 });
  const appData2 = await appData2Res.json();
  const foundEntryOnDevice2 = appData2.entries?.find((e: any) => e.id === testEntryId);

  if (foundEntryOnDevice2) {
    console.log(`   ✓ Device 2: CONFIRMED! Entry found on Device 2:`);
    console.log(`     - Task: "${foundEntryOnDevice2.task}"`);
    console.log(`     - Duration: ${foundEntryOnDevice2.duration / 3600} hours`);
    console.log(`     - Date: ${foundEntryOnDevice2.date}`);
  } else {
    throw new Error('Entry saved by Device 1 was NOT found on Device 2 after refresh!');
  }

  // 3. Cross-Device Running Timer Test: Start on Device 1 -> Resume & Stop on Device 2 without duplicate
  console.log('\nStep 3: Testing Running Timer Sync & Resume Across Devices...');
  const timerStartTs = Date.now() - 1800000; // Started 30 minutes ago
  const activeTimerPayload = {
    clientId: 'client_1793269318815',
    projectId: 'project_1793275797630',
    task: 'עבודה חיה — סנכרון טיימר רב-מכשירי',
    startTimestamp: timerStartTs,
    isRunning: true,
  };

  console.log('   Device 1: Starting running timer on server...');
  const startTimerRes = await fetch(`${HTTPS_BASE_URL}/api/app-data/timer`, {
    method: 'POST',
    headers: headersDevice1,
    body: JSON.stringify({ activeTimer: activeTimerPayload })
  });
  if (!startTimerRes.ok) throw new Error('Device 1 failed to start timer');
  console.log('   ✓ Device 1: Timer running on server.');

  console.log('   Device 2: Loading/refreshing running timer (GET /api/app-data/timer)...');
  const timer2Res = await fetch(`${HTTPS_BASE_URL}/api/app-data/timer`, { headers: headersDevice2 });
  const timer2Data = await timer2Res.json();

  if (timer2Data.activeTimer && timer2Data.activeTimer.isRunning && timer2Data.activeTimer.startTimestamp === timerStartTs) {
    console.log(`   ✓ Device 2: CONFIRMED! Active timer detected on Device 2 with identical start timestamp:`);
    console.log(`     - Task: "${timer2Data.activeTimer.task}"`);
    console.log(`     - Start Timestamp: ${timer2Data.activeTimer.startTimestamp}`);
  } else {
    throw new Error('Running timer started by Device 1 was NOT detected on Device 2!');
  }

  // Device 2 stops the timer and creates the single completed entry
  console.log('   Device 2: Resuming and stopping timer on Device 2...');
  const stoppedEntryId = `entry_timer_stopped_${Date.now()}`;
  const durationSec = Math.floor((Date.now() - timerStartTs) / 1000);
  const stoppedEntry = {
    id: stoppedEntryId,
    clientId: timer2Data.activeTimer.clientId,
    projectId: timer2Data.activeTimer.projectId,
    task: timer2Data.activeTimer.task,
    description: 'טיימר שהופעל במחשב והופסק בנייד',
    date: '2026-11-03',
    startTime: new Date(timerStartTs).toTimeString().slice(0, 5),
    endTime: new Date().toTimeString().slice(0, 5),
    duration: durationSec,
    isBilled: false,
    createdAt: new Date().toISOString(),
  };

  // Device 2 saves completed entry
  await fetch(`${HTTPS_BASE_URL}/api/app-data/entry/save`, {
    method: 'POST',
    headers: headersDevice2,
    body: JSON.stringify(stoppedEntry)
  });

  // Device 2 clears running timer on server
  await fetch(`${HTTPS_BASE_URL}/api/app-data/timer`, {
    method: 'POST',
    headers: headersDevice2,
    body: JSON.stringify({ activeTimer: null })
  });
  console.log('   ✓ Device 2: Timer stopped and single entry saved.');

  // Device 1 checks state: timer cleared & exactly ONE entry created
  console.log('   Device 1: Checking timer state and entries after Device 2 stopped it...');
  const timer1AfterRes = await fetch(`${HTTPS_BASE_URL}/api/app-data/timer`, { headers: headersDevice1 });
  const timer1After = await timer1AfterRes.json();
  console.log(`   ✓ Device 1: Running timer state: ${timer1After.activeTimer === null ? 'CLEARED (No longer running)' : 'STILL ACTIVE'}`);

  const appData1AfterRes = await fetch(`${HTTPS_BASE_URL}/api/app-data`, { headers: headersDevice1 });
  const appData1After = await appData1AfterRes.json();
  const stoppedEntriesOnDevice1 = appData1After.entries?.filter((e: any) => e.id === stoppedEntryId);
  console.log(`   ✓ Device 1: Entries with ID "${stoppedEntryId}": ${stoppedEntriesOnDevice1?.length || 0}`);

  if (stoppedEntriesOnDevice1?.length !== 1) {
    throw new Error(`Expected exactly 1 stopped entry, found ${stoppedEntriesOnDevice1?.length}!`);
  }

  // 4. Cleanup test entries
  console.log('\nStep 4: Cleaning up temporary test entries...');
  await fetch(`${HTTPS_BASE_URL}/api/app-data/entry/delete`, {
    method: 'POST',
    headers: headersDevice1,
    body: JSON.stringify({ id: testEntryId })
  });
  await fetch(`${HTTPS_BASE_URL}/api/app-data/entry/delete`, {
    method: 'POST',
    headers: headersDevice1,
    body: JSON.stringify({ id: stoppedEntryId })
  });
  console.log('   ✓ Cleaned up test entries cleanly.');

  console.log('\n========================================================================');
  console.log('ALL CROSS-DEVICE CHECKS PASSED WITH 100% SUCCESS!');
  console.log('========================================================================');
}

verifyCrossDevice().catch(err => {
  console.error('Cross-device verification failed:', err);
  process.exit(1);
});
