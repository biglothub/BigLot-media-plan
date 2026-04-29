import {
	VIDEO_CAROUSEL_MUSIC_TRACK_BY_ID,
	type VideoCarouselMusicTrackId
} from '$lib/video-carousel';

type GeneratedTrackId = Exclude<VideoCarouselMusicTrackId, 'none'>;

interface MusicArrangement {
	bpm: number;
	chords: number[][];
	bass: number[];
	lead: number[];
	chordWave: OscillatorType;
	leadWave: OscillatorType;
	bassWave: OscillatorType;
	drumLevel: number;
	chordLevel: number;
	leadLevel: number;
	bassLevel: number;
	filterHz: number;
}

export interface VideoCarouselMusicPlayback {
	stop: () => void;
	done: Promise<void>;
}

export interface VideoCarouselMusicStreamHandle {
	stream: MediaStream;
	stop: () => void;
	done: Promise<void>;
}

const ARRANGEMENTS: Record<GeneratedTrackId, MusicArrangement> = {
	biglot_pulse: {
		bpm: 104,
		chords: [
			[196, 246.94, 293.66, 369.99],
			[174.61, 220, 261.63, 329.63],
			[146.83, 196, 246.94, 293.66],
			[164.81, 207.65, 246.94, 311.13]
		],
		bass: [98, 87.31, 73.42, 82.41],
		lead: [587.33, 493.88, 440, 493.88, 369.99, 440, 493.88, 587.33],
		chordWave: 'sawtooth',
		leadWave: 'triangle',
		bassWave: 'square',
		drumLevel: 0.52,
		chordLevel: 0.17,
		leadLevel: 0.07,
		bassLevel: 0.13,
		filterHz: 1850
	},
	market_lofi: {
		bpm: 82,
		chords: [
			[174.61, 220, 261.63, 329.63],
			[146.83, 196, 246.94, 293.66],
			[164.81, 207.65, 246.94, 311.13],
			[130.81, 174.61, 220, 261.63]
		],
		bass: [87.31, 73.42, 82.41, 65.41],
		lead: [440, 392, 329.63, 392, 493.88, 440, 392, 329.63],
		chordWave: 'triangle',
		leadWave: 'sine',
		bassWave: 'triangle',
		drumLevel: 0.34,
		chordLevel: 0.2,
		leadLevel: 0.055,
		bassLevel: 0.1,
		filterHz: 1250
	},
	calm_focus: {
		bpm: 72,
		chords: [
			[196, 246.94, 293.66, 369.99],
			[220, 277.18, 329.63, 415.3],
			[164.81, 207.65, 246.94, 329.63],
			[174.61, 220, 261.63, 349.23]
		],
		bass: [98, 110, 82.41, 87.31],
		lead: [493.88, 440, 392, 440, 369.99, 392, 440, 493.88],
		chordWave: 'sine',
		leadWave: 'triangle',
		bassWave: 'sine',
		drumLevel: 0.18,
		chordLevel: 0.23,
		leadLevel: 0.045,
		bassLevel: 0.08,
		filterHz: 980
	}
};

function createAudioContext(): AudioContext {
	const AudioCtor =
		globalThis.AudioContext ??
		(globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!AudioCtor) throw new Error('Browser ไม่รองรับ Web Audio');
	return new AudioCtor();
}

function normalizeVolume(volumePercent: number): number {
	if (!Number.isFinite(volumePercent)) return 0.45;
	return Math.min(Math.max(volumePercent, 0), 100) / 100;
}

function proxiedJamendoAudioUrl(audioUrl: string): string {
	const params = new URLSearchParams({ url: audioUrl });
	return `/api/video-carousel/music/audio?${params.toString()}`;
}

function createEnvelopeGain(
	ctx: AudioContext,
	startAt: number,
	duration: number,
	peak: number,
	attack = 0.025,
	release = 0.22
): GainNode {
	const gain = ctx.createGain();
	const endAt = startAt + duration;
	const releaseAt = Math.max(startAt + attack, endAt - release);
	gain.gain.setValueAtTime(0, startAt);
	gain.gain.linearRampToValueAtTime(peak, startAt + attack);
	gain.gain.setValueAtTime(peak, releaseAt);
	gain.gain.linearRampToValueAtTime(0.0001, endAt);
	return gain;
}

function scheduleTone(
	ctx: AudioContext,
	destination: AudioNode,
	nodes: AudioScheduledSourceNode[],
	frequency: number,
	startAt: number,
	duration: number,
	type: OscillatorType,
	level: number
) {
	const oscillator = ctx.createOscillator();
	oscillator.type = type;
	oscillator.frequency.setValueAtTime(frequency, startAt);
	const gain = createEnvelopeGain(ctx, startAt, duration, level);
	oscillator.connect(gain);
	gain.connect(destination);
	oscillator.start(startAt);
	oscillator.stop(startAt + duration + 0.02);
	nodes.push(oscillator);
}

function scheduleKick(
	ctx: AudioContext,
	destination: AudioNode,
	nodes: AudioScheduledSourceNode[],
	startAt: number,
	level: number
) {
	const oscillator = ctx.createOscillator();
	oscillator.type = 'sine';
	oscillator.frequency.setValueAtTime(130, startAt);
	oscillator.frequency.exponentialRampToValueAtTime(45, startAt + 0.18);

	const gain = ctx.createGain();
	gain.gain.setValueAtTime(level, startAt);
	gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);

	oscillator.connect(gain);
	gain.connect(destination);
	oscillator.start(startAt);
	oscillator.stop(startAt + 0.24);
	nodes.push(oscillator);
}

function scheduleNoiseHit(
	ctx: AudioContext,
	destination: AudioNode,
	nodes: AudioScheduledSourceNode[],
	startAt: number,
	duration: number,
	level: number,
	filterType: BiquadFilterType,
	filterHz: number
) {
	const sampleCount = Math.max(1, Math.round(ctx.sampleRate * duration));
	const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < sampleCount; i += 1) {
		data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
	}

	const source = ctx.createBufferSource();
	source.buffer = buffer;
	const filter = ctx.createBiquadFilter();
	filter.type = filterType;
	filter.frequency.setValueAtTime(filterHz, startAt);
	const gain = createEnvelopeGain(ctx, startAt, duration, level, 0.006, duration * 0.72);

	source.connect(filter);
	filter.connect(gain);
	gain.connect(destination);
	source.start(startAt);
	source.stop(startAt + duration + 0.02);
	nodes.push(source);
}

function scheduleGeneratedMusic(
	ctx: AudioContext,
	destination: AudioNode,
	trackId: GeneratedTrackId,
	volumePercent: number,
	durationSeconds: number
): () => void {
	const arrangement = ARRANGEMENTS[trackId];
	const nodes: AudioScheduledSourceNode[] = [];
	const startAt = ctx.currentTime + 0.08;
	const duration = Math.max(1, durationSeconds);
	const beat = 60 / arrangement.bpm;
	const bar = beat * 4;

	const master = ctx.createGain();
	master.gain.setValueAtTime(normalizeVolume(volumePercent) * 0.82, startAt);

	const filter = ctx.createBiquadFilter();
	filter.type = 'lowpass';
	filter.frequency.setValueAtTime(arrangement.filterHz, startAt);
	filter.Q.setValueAtTime(0.62, startAt);

	master.connect(filter);
	filter.connect(destination);

	const chordBus = ctx.createGain();
	chordBus.gain.setValueAtTime(arrangement.chordLevel, startAt);
	chordBus.connect(master);

	const rhythmBus = ctx.createGain();
	rhythmBus.gain.setValueAtTime(1, startAt);
	rhythmBus.connect(master);

	for (let t = 0; t < duration + bar; t += bar) {
		const chord = arrangement.chords[Math.floor(t / bar) % arrangement.chords.length];
		for (const frequency of chord) {
			scheduleTone(ctx, chordBus, nodes, frequency, startAt + t, bar * 0.94, arrangement.chordWave, 1);
		}
	}

	for (let t = 0; t < duration + beat; t += beat) {
		const step = Math.round(t / beat);
		const bassRoot = arrangement.bass[Math.floor(t / bar) % arrangement.bass.length];
		if (step % 2 === 0 || trackId === 'biglot_pulse') {
			scheduleTone(
				ctx,
				rhythmBus,
				nodes,
				bassRoot,
				startAt + t,
				beat * 0.58,
				arrangement.bassWave,
				arrangement.bassLevel
			);
		}
		if (step % 8 === 2 || step % 8 === 6) {
			const lead = arrangement.lead[(step + Math.floor(t / bar)) % arrangement.lead.length];
			scheduleTone(
				ctx,
				rhythmBus,
				nodes,
				lead,
				startAt + t,
				beat * 0.42,
				arrangement.leadWave,
				arrangement.leadLevel
			);
		}

		if (step % 4 === 0) scheduleKick(ctx, rhythmBus, nodes, startAt + t, arrangement.drumLevel);
		if (step % 4 === 2) {
			scheduleNoiseHit(ctx, rhythmBus, nodes, startAt + t, 0.16, arrangement.drumLevel * 0.32, 'bandpass', 1800);
		}
		if (step % 2 === 1) {
			scheduleNoiseHit(ctx, rhythmBus, nodes, startAt + t, 0.055, arrangement.drumLevel * 0.16, 'highpass', 5200);
		}
	}

	return () => {
		for (const node of nodes) {
			try {
				node.stop();
			} catch {
				// Already stopped.
			}
			node.disconnect();
		}
		master.disconnect();
		filter.disconnect();
		chordBus.disconnect();
		rhythmBus.disconnect();
	};
}

function assertGeneratedTrack(trackId: VideoCarouselMusicTrackId): GeneratedTrackId {
	if (trackId === 'none' || !VIDEO_CAROUSEL_MUSIC_TRACK_BY_ID[trackId]) {
		throw new Error('กรุณาเลือกเพลงก่อน');
	}
	return trackId;
}

export async function createVideoCarouselMusicPreview(
	trackId: VideoCarouselMusicTrackId,
	volumePercent: number,
	durationSeconds = 12
): Promise<VideoCarouselMusicPlayback> {
	const generatedTrack = assertGeneratedTrack(trackId);
	const ctx = createAudioContext();
	await ctx.resume();

	let stopped = false;
	let resolveDone: () => void = () => {};
	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});
	const cleanup = scheduleGeneratedMusic(ctx, ctx.destination, generatedTrack, volumePercent, durationSeconds);
	const timer = globalThis.setTimeout(() => stop(), Math.round((durationSeconds + 0.35) * 1000));

	function stop() {
		if (stopped) return;
		stopped = true;
		globalThis.clearTimeout(timer);
		cleanup();
		void ctx.close().finally(resolveDone);
	}

	return { stop, done };
}

export async function createVideoCarouselExternalMusicPreview(
	audioUrl: string,
	volumePercent: number,
	durationSeconds = 12
): Promise<VideoCarouselMusicPlayback> {
	const audio = new Audio(proxiedJamendoAudioUrl(audioUrl));
	audio.crossOrigin = 'anonymous';
	audio.loop = true;
	audio.volume = normalizeVolume(volumePercent);
	audio.preload = 'auto';

	let stopped = false;
	let resolveDone: () => void = () => {};
	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});
	const timer = globalThis.setTimeout(() => stop(), Math.round((durationSeconds + 0.35) * 1000));

	function stop() {
		if (stopped) return;
		stopped = true;
		globalThis.clearTimeout(timer);
		audio.pause();
		audio.removeAttribute('src');
		audio.load();
		resolveDone();
	}

	await audio.play().catch((error: unknown) => {
		stop();
		throw error;
	});

	return { stop, done };
}

export async function createVideoCarouselMusicStream(
	trackId: VideoCarouselMusicTrackId,
	volumePercent: number,
	durationSeconds: number
): Promise<VideoCarouselMusicStreamHandle> {
	const generatedTrack = assertGeneratedTrack(trackId);
	const ctx = createAudioContext();
	await ctx.resume();

	const destination = ctx.createMediaStreamDestination();
	let stopped = false;
	let resolveDone: () => void = () => {};
	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});
	const cleanup = scheduleGeneratedMusic(ctx, destination, generatedTrack, volumePercent, durationSeconds);
	const timer = globalThis.setTimeout(() => stop(), Math.round((durationSeconds + 0.5) * 1000));

	function stop() {
		if (stopped) return;
		stopped = true;
		globalThis.clearTimeout(timer);
		cleanup();
		for (const track of destination.stream.getTracks()) track.stop();
		void ctx.close().finally(resolveDone);
	}

	return {
		stream: destination.stream,
		stop,
		done
	};
}

export async function createVideoCarouselExternalMusicStream(
	audioUrl: string,
	volumePercent: number,
	durationSeconds: number
): Promise<VideoCarouselMusicStreamHandle> {
	const ctx = createAudioContext();
	await ctx.resume();

	const destination = ctx.createMediaStreamDestination();
	const response = await fetch(proxiedJamendoAudioUrl(audioUrl));
	if (!response.ok) {
		await ctx.close();
		throw new Error(`โหลดเพลง Jamendo ไม่สำเร็จ (${response.status})`);
	}
	const audioData = await response.arrayBuffer();
	const buffer = await ctx.decodeAudioData(audioData);
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.loop = true;

	const gain = ctx.createGain();
	gain.gain.setValueAtTime(normalizeVolume(volumePercent) * 0.9, ctx.currentTime);
	source.connect(gain);
	gain.connect(destination);

	let stopped = false;
	let resolveDone: () => void = () => {};
	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});
	const duration = Math.max(1, durationSeconds);
	const startAt = ctx.currentTime + 0.08;
	const timer = globalThis.setTimeout(() => stop(), Math.round((duration + 0.5) * 1000));
	source.start(startAt);
	source.stop(startAt + duration + 0.25);
	source.onended = () => stop();

	function stop() {
		if (stopped) return;
		stopped = true;
		globalThis.clearTimeout(timer);
		try {
			source.stop();
		} catch {
			// Already stopped.
		}
		source.disconnect();
		gain.disconnect();
		for (const track of destination.stream.getTracks()) track.stop();
		void ctx.close().finally(resolveDone);
	}

	return {
		stream: destination.stream,
		stop,
		done
	};
}
