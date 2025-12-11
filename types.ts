export enum LoadingStage {
  IDLE = 'IDLE',
  WRITING_SCRIPT = 'WRITING_SCRIPT',
  GENERATING_ART = 'GENERATING_ART',
  SYNTHESIZING_AUDIO = 'SYNTHESIZING_AUDIO',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface DialogueLine {
  speaker: 'Host' | 'Guest';
  text: string;
}

export interface PodcastScript {
  title: string;
  topic: string;
  dialogue: DialogueLine[];
}

export interface PodcastEpisode {
  id: string;
  script: PodcastScript;
  coverImageBase64: string | null; // Data URL
  audioBuffer: AudioBuffer | null;
}

export interface AudioVisualizerProps {
  audioContext: AudioContext | null;
  sourceNode: AudioBufferSourceNode | null;
  isPlaying: boolean;
}