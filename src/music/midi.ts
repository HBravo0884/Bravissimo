/**
 * Optional input from a digital piano over USB/Bluetooth MIDI. Works in
 * Chrome, Edge and Android browsers; iPad Safari has no Web MIDI, and the
 * on-screen keys keep working there.
 */
export function midiSupported(): boolean {
  return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
}

export interface MidiConnection {
  inputs: string[];
  close: () => void;
}

export async function connectMidi(onNoteOn: (note: number) => void): Promise<MidiConnection> {
  const access = await navigator.requestMIDIAccess();
  const handler = (e: MIDIMessageEvent) => {
    const data = e.data;
    if (!data || data.length < 3) return;
    const command = data[0] & 0xf0;
    if (command === 0x90 && data[2] > 0) onNoteOn(data[1]);
  };
  const attach = () => access.inputs.forEach((input) => (input.onmidimessage = handler));
  attach();
  access.onstatechange = attach;
  return {
    inputs: [...access.inputs.values()].map((i) => i.name ?? "MIDI keyboard"),
    close: () => {
      access.onstatechange = null;
      access.inputs.forEach((input) => (input.onmidimessage = null));
    },
  };
}
