# Ollama

Ollama runs language models on your Mac. When you choose Ollama in Money, nothing leaves your Mac when Money sorts transactions. A local model can be less accurate than Claude. Expect more charges in [Review](review.md).

## Install Ollama

1. Go to <https://ollama.com/download> and download Ollama for macOS.
2. Open the file and move Ollama to **Applications**.
3. Open Ollama. It runs in the menu bar.

## Get a chat model

Open **Terminal** and run:

```sh
ollama pull llama3.1:8b
```

Wait for the download to end. To list your models, run `ollama list`.

## Choose it in Money

1. Open **Settings**, then **Categorization**.
2. Click **Ollama (local)**.
3. Click **Refresh models**.
4. Choose your model in **Model**.
5. Click **Test the model**.

Money shows "Ollama running" when it reaches Ollama. The **Model** list shows the number of chat models found.

You can also choose Ollama during [setup](getting-started.md).

## Why an embedding model is not in the list

Money lists only models that can chat. Embedding models, such as `nomic-embed-text`, cannot answer a question. Money hides them, so you cannot pick one by mistake.

## Thinking models

Some models, such as `qwen3`, think for a while before they answer. Money turns thinking off when it asks Ollama. A model that always thinks can still be slow. If sorting is slow, choose a smaller model.

## Troubleshooting

| Money shows | What it means | What to do |
|---|---|---|
| "Ollama is not running at <address>. Start Ollama and try again." | Money cannot reach Ollama. | Open Ollama. Check **Ollama address** in **Settings**. The default is `http://localhost:11434`. |
| "Ollama: … does not support chat" | The model you chose is not a chat model. | Choose a chat model. Run `ollama pull llama3.1:8b`. |
| "Ollama: model … not found" | The model is not installed. | Run `ollama pull <model>`, or choose another model. Click **Refresh models**. |
| "No local models found" in **Model** | Ollama has no chat model. | Pull a chat model. Click **Refresh models**. |

Money prints the message from Ollama after "Ollama:". The exact words come from your Ollama version.
