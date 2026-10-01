# 取扱説明書の動画の声（VOICEVOX）

説明書の動画（`product/docs/videos/*.mp4`）の声は、VOICEVOX core で作っています。
ここにあるのは、その出来上がり（`<hash>.ogg`）と長さの一覧（`index.json`）です。
同じ台詞は作り直さないので、台本を足したときは、足したぶんだけ声を作れば済みます。

## 話す人

| 役 | キャラクター | スタイルID |
|---|---|---|
| 案内役 | 冥鳴ひまり | 14 |
| セラピスト役（場面を持ち込む） | 春日部つむぎ | 8 |
| 確かめ・まとめ | ずんだもん | 3 |

各キャラクターの利用規約で、**「VOICEVOX:キャラクター名」のクレジットが必須**です。
動画の最後の札と、取扱説明書のいちばん下に出しています。消さないでください。

## 作り方

```sh
# 1. 台本（scripts/manual-videos/scenes.js）から、まだ声が無い台詞を書き出す
node scripts/build-manual-videos.js lines

# 2. VOICEVOX core が動く Linux で読み上げる（時間がかかるので、途中で切って続きからできる）
VV_BUDGET=150 VV_OUT=scripts/voice python3 scripts/voice/tts.py scripts/voice/pending.json

# 3. 録る（別の窓で node management/09_Verification/serve-with-headers.js）
node scripts/build-manual-videos.js            # 全部
node scripts/build-manual-videos.js 2-1 3-1    # 番号を指定
DRY=1 node scripts/build-manual-videos.js      # 声なしで、押す場所が合っているかだけ確かめる
```

## VOICEVOX core の用意（~/vv）

GitHub の Releases から取ります（2026-10 時点）。

- `voicevox_core-0.17.0-cp310-abi3-manylinux_2_34_x86_64.whl` を `pip install`
- `voicevox_onnxruntime-linux-x64-1.17.3.tgz`（VOICEVOX/onnxruntime-builder）を展開
- `open_jtalk_dic_utf_8-1.11.tar.gz`（r9y9/open_jtalk v1.11.1）を展開
- `0.vvm`（ずんだもん・春日部つむぎ）と `1.vvm`（冥鳴ひまり）（VOICEVOX/voicevox_vvm 0.16.4）

読み間違いやすい言葉（顧客No.、絵文字など）は、`build-manual-videos.js` の `READINGS` で読みに直しています。
