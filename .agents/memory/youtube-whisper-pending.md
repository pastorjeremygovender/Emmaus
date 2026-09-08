---
name: YouTube Whisper pending state
description: YouTube archive records can remain in whisper-pending after caption lookup fails.
---

`whisper-pending` means caption import found no usable YouTube caption track and the video was intended for audio transcription. The bulk pipeline must explicitly include this state or provide a retry path; otherwise old records can remain pending indefinitely.

**Why:** A published/approved archive video can look healthy while lacking the transcript required for sermon search, detection, and companion generation.

**How to apply:** Treat whisper-pending as actionable backlog, distinguish it from active transcription, and expose or run a retry that updates status and records the failure reason.