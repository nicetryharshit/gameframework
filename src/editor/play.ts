// Play mode: a runtime built from the current scene. Stopping drops the runtime, and the scene is unchanged.

import { createSceneRuntime } from '../scene/index';
import { byId } from './dom';
import { setButton } from './chrome';
import { createAudio } from './assets';
import { onRender, render, session } from './session';
import { draw } from './canvas';
import { describe, logMessage } from './log';

const playButton = byId<HTMLButtonElement>('play');
const pauseButton = byId<HTMLButtonElement>('pause');
const playBanner = byId<HTMLElement>('play-banner');

function tick(now: number) {
  const current = session.play;
  if (!current) return;
  const seconds = Math.min(0.1, (now - current.last) / 1000);
  current.last = now;
  if (!current.paused) current.runtime.advance(seconds);
  draw();
  current.frame = requestAnimationFrame(tick);
}

export function startPlay() {
  if (session.play) return;
  try {
    const runtime = createSceneRuntime(session.state.scene, {
      createAudio: createAudio(message => logMessage('error', message)),
      onWarning: message => logMessage('warn', message)
    });
    session.play = { runtime, last: performance.now(), frame: 0, paused: false };
    session.play.frame = requestAnimationFrame(tick);
    logMessage('info', 'Play mode started. Edits are locked until you stop.');
  } catch (error) {
    logMessage('error', `Could not start play mode: ${describe(error)}`);
  }
  session.hovered = null;
  render();
}

export function stopPlay() {
  const current = session.play;
  if (!current) return;
  cancelAnimationFrame(current.frame);
  current.runtime.dispose();
  session.play = null;
  logMessage('info', 'Play mode stopped. The scene is back to how it was before play.');
  render();
}

export function togglePlay() {
  if (session.play) stopPlay();
  else startPlay();
}

export function togglePause() {
  if (!session.play) return;
  session.play.paused = !session.play.paused;
  render();
}

/** Keeps the play and pause buttons, banner and body class in step with play mode. */
function renderPlayUi() {
  const play = session.play;
  setButton(playButton, play ? 'Stop' : 'Play', play ? 'stop' : 'play');
  playButton.classList.toggle('active', play !== null);
  pauseButton.disabled = play === null;
  setButton(pauseButton, play?.paused ? 'Resume' : 'Pause', play?.paused ? 'play' : 'pause');
  playBanner.hidden = play === null;
  playBanner.textContent = play?.paused ? 'PAUSED' : 'PLAYING';
  document.body.classList.toggle('playing', play !== null);
}

export function initPlay() {
  playButton.addEventListener('click', togglePlay);
  pauseButton.addEventListener('click', togglePause);
  onRender(renderPlayUi);
}
