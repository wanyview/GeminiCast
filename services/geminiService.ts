import { GoogleGenAI, Type, Modality } from "@google/genai";
import { PodcastScript } from "../types";

// Initialize Gemini Client
// Note: We use process.env.API_KEY as per instructions.
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY not found in environment");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Step 1: Generate the Podcast Script (JSON)
 * Uses gemini-3-pro-preview for complex reasoning and creative writing.
 */
export const generateScript = async (topic: string): Promise<PodcastScript> => {
  const ai = getAiClient();
  
  const prompt = `Create a short, engaging podcast script about: "${topic}".
  There are two speakers: "Host" (energetic, knowledgeable) and "Guest" (curious, asks good questions).
  The conversation should be approximately 6-8 exchanges long.
  Keep it punchy and fun.
  Return ONLY valid JSON.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "A catchy title for the episode" },
          topic: { type: Type.STRING },
          dialogue: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                speaker: { type: Type.STRING, enum: ["Host", "Guest"] },
                text: { type: Type.STRING, description: "The spoken text" }
              },
              required: ["speaker", "text"]
            }
          }
        },
        required: ["title", "topic", "dialogue"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No script generated");
  
  return JSON.parse(text) as PodcastScript;
};

/**
 * Step 2: Generate Cover Art
 * Uses gemini-3-pro-image-preview for high quality.
 */
export const generateCoverArt = async (title: string, topic: string): Promise<string> => {
  const ai = getAiClient();
  
  // Create a visually descriptive prompt based on the title
  const prompt = `Album cover art for a podcast titled "${title}" about ${topic}. 
  Minimalist, high-end, 4k, trending on artstation, vivid colors, abstract geometric shapes or relevant symbolism. 
  No text on image other than the title if possible, or just clean art.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: "1K"
      }
    }
  });

  // Extract image
  let base64Data = "";
  if (response.candidates && response.candidates[0].content.parts) {
    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            base64Data = part.inlineData.data;
            break;
        }
    }
  }

  if (!base64Data) throw new Error("No image generated");
  return `data:image/png;base64,${base64Data}`;
};

/**
 * Step 3: Generate Multi-Speaker Audio
 * Uses gemini-2.5-flash-preview-tts
 */
export const generateAudio = async (script: PodcastScript, audioContext: AudioContext): Promise<AudioBuffer> => {
  const ai = getAiClient();

  // Convert script to text format for TTS prompt if needed, 
  // but for multi-speaker, we usually pass the text and mapping is handled by the model context 
  // OR we instruct it to read perfectly.
  // However, the `generateContent` for TTS simply takes text. 
  // To get multi-speaker, we use the specific config.
  
  // We need to format the prompt so the model knows who says what, 
  // matching the speaker names in the config.
  const scriptText = script.dialogue.map(line => `${line.speaker}: ${line.text}`).join("\n");

  const prompt = `Read the following dialogue exactly as written, assigning the voices to the correct speakers.\n\n${scriptText}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: 'Host',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } // Deep, authoritative
            },
            {
              speaker: 'Guest',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Nova' } } // Lighter, energetic (using a mapped name, Nova isn't standard in list, using 'Puck' or 'Kore')
              // Available: Puck, Charon, Kore, Fenrir, Aoede.
            }
          ]
        }
      }
    }
  });

  // Fix: If 'Guest' voice isn't picked up well, we might need standard names.
  // Let's re-map safely:
  // Host -> Fenrir
  // Guest -> Aoede (Soft, higher pitch)
  
  const safeResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: 'Host',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } 
            },
            {
              speaker: 'Guest',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            }
          ]
        }
      }
    }
  });


  let audioBase64 = "";
  if (safeResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
    audioBase64 = safeResponse.candidates[0].content.parts[0].inlineData.data;
  }

  if (!audioBase64) throw new Error("No audio generated");

  // Decode the audio
  const binaryString = atob(audioBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return await audioContext.decodeAudioData(bytes.buffer);
};