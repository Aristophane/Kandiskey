from mido import MidiFile, MidiTrack
import base64


def clean_midi(input_path, output_path):
    mid = MidiFile(input_path)
    new_mid = MidiFile()
    
    for track in mid.tracks:
        new_track = MidiTrack()
        new_mid.tracks.append(new_track)

        for msg in track:
            # Keep only note_on / note_off messages
            if msg.type in ['note_on', 'note_off']:
                new_track.append(msg.copy())
            
            # Optional: keep tempo if you want timing consistency
            elif msg.type == 'set_tempo':
                new_track.append(msg.copy())

    new_mid.save(output_path)

# Usage
clean_midi("Edith_Piaf_La_Vie_En_Rose.mid", "cleaned.mid")



with open("cleaned.mid", "rb") as f:
    encoded = base64.b64encode(f.read()).decode("utf-8")

print(encoded)