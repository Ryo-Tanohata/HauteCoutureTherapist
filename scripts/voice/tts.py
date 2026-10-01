"""台本の台詞を VOICEVOX core で読み上げ、scripts/voice/<hash>.ogg にする。

使い方:
    python3 scripts/voice/tts.py scripts/voice/pending.json

置き場所（環境変数で変えられる）:
    VV_HOME   … VOICEVOX core 一式を置いたところ（既定 ~/vv）
                  voicevox_onnxruntime-linux-x64-1.17.3/  open_jtalk_dic_utf_8-1.11/  0.vvm  1.vvm
    VV_OUT    … 出来上がりを書くところ（既定 このファイルと同じ場所）

長さ（秒）は index.json に足していく。動画を作る側はこの長さだけ待つ。
"""
import json
import os
import subprocess
import sys
import wave

from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile

HOME = os.path.expanduser(os.environ.get('VV_HOME', '~/vv'))
OUT = os.environ.get('VV_OUT', os.path.dirname(os.path.abspath(__file__)))


def main(path):
    jobs = json.load(open(path, encoding='utf-8'))
    if not jobs:
        print('読むものはありません')
        return
    ort = Onnxruntime.load_once(
        filename=os.path.join(HOME, 'voicevox_onnxruntime-linux-x64-1.17.3/lib/libvoicevox_onnxruntime.so.1.17.3'))
    syn = Synthesizer(ort, OpenJtalk(os.path.join(HOME, 'open_jtalk_dic_utf_8-1.11')))
    for v in ('0.vvm', '1.vvm'):             # 0: ずんだもん・春日部つむぎ　1: 冥鳴ひまり
        with VoiceModelFile.open(os.path.join(HOME, v)) as m:
            syn.load_voice_model(m)

    index_path = os.path.join(OUT, 'index.json')
    index = json.load(open(index_path, encoding='utf-8')) if os.path.exists(index_path) else {}
    os.makedirs(OUT, exist_ok=True)
    budget = float(os.environ.get('VV_BUDGET', '0'))    # 秒。0 なら全部。途中で切って、次の回に続きから
    import time
    t0 = time.time()
    for j in jobs:
        if j['hash'] in index and os.path.exists(os.path.join(OUT, j['hash'] + '.ogg')):
            continue
        if budget and time.time() - t0 > budget:
            print('（時間切れ。もう一度実行すると続きから）')
            break
        q = syn.create_audio_query(j['text'], j['style'])
        q.speed_scale = j.get('speed', 1.08)
        q.pre_phoneme_length = 0.05
        q.post_phoneme_length = 0.1
        wav_path = os.path.join(OUT, j['hash'] + '.wav')
        with open(wav_path, 'wb') as f:
            f.write(syn.synthesis(q, j['style']))
        with wave.open(wav_path) as w:
            dur = w.getnframes() / w.getframerate()
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path,
                        '-c:a', 'libopus', '-b:a', '40k', '-ac', '1',
                        os.path.join(OUT, j['hash'] + '.ogg')], check=True)
        os.remove(wav_path)
        index[j['hash']] = {'dur': round(dur, 3), 'who': j['who'], 'text': j['text']}
        print(f"{dur:5.2f}s  {j['who']:8s} {j['text']}")
        with open(index_path, 'w', encoding='utf-8') as f:      # 1行ごとに書く（途中で止まっても残る）
            json.dump(index, f, ensure_ascii=False, indent=1, sort_keys=True)
            f.write('\n')
    left = sum(1 for j in jobs if j['hash'] not in index)
    print(f'残り {left} 行')


if __name__ == '__main__':
    main(sys.argv[1])
