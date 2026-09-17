     let chapterData: Awaited<ReturnType<typeof remoteBibleProvider.getChapter>> = null;
        try {
          chapterData = await remoteBibleProvider.getChapter(resolvedRef.bookId, resolvedRef.chapter, translation.resolvedId);
          console.log('[VOICE] Bible fetch result:', resolvedRef.bookId, resolvedRef.chapter, translation.resolvedId, '→ verses:', chapterData?.verses?.length ?? 0);
        } catch (err) {
          console.error('[VOICE] Bible fetch error:', String(err), { bookId: resolvedRef.bookId, chapter: resolvedRef.chapter, translation: translation.resolvedId });
          return false;
        }
        if (!chapterData?.verses?.length) {
          console.log('[VOICE] Bible fetch: no verses returned for', resolvedRef.bookId, resolvedRef.chapter);
          return false;
        }

        bibleContextRef.current = { bookId: resolvedRef.bookId, chapter: resolvedRef.chapter, translationId: translation.resolvedId };
        readingResourceRef.current = {
          type: 'bible',
          id: `${resolvedRef.bookId}:${resolvedRef.chapter}`,
          bookId: resolvedRef.bookId,
          chapter: resolvedRef.chapter,
          translationId: translation.resolvedId,
        };

        // Navigate the screen to the chapter being read so the user can follow along.
        const navFnBible = navigateRef.current ?? providerNavigateRef.current;
        // App.tsx registers the chapter reader under this canonical route.
        // Never derive a second Bible URL shape in the Voice engine.
        const bibleRoute = `/bible/read/${resolvedRef.bookId}/${resolvedRef.chapter}`;
        if (navFnBible) {
          navFnBible(bibleRoute);
        } else {
          window.history.pushState({}, '', bibleRoute);
        }

        const displayBook        = resolvedRef.bookName;
        const displayTranslation = translation.resolvedId.toUpperCase();

        if (resolvedRef.verse) {
          const start = Math.max(1, resolvedRef.verse - 1);
          const end   = Math.min(chapterData.verses.length, resolvedRef.verse + 4);
          const chunk = chapterData.verses.filter((v) => v.verse >= start && v.verse <= end);
          sections.push({ label: `${displayBook} ${resolvedRef.chapter}:${resolvedRef.verse} (${displayTranslation})`, text: chunk.map((v) => `Verse ${v.verse}: ${v.text}`).join(' ') });
        } else {
          const CHUNK = 8;
          for (let i = 0; i < chapterData.verses.length; i += CHUNK) {
            const chunk  = chapterData.verses.slice(i, i + CHUNK);
            sections.push({ label: `${displayBook} ${resolvedRef.chapter}:${chunk[0].verse}–${chunk[chunk.length - 1].verse} (${displayTranslation})`, text: chunk.map((v) => `Verse ${v.verse}: ${v.text}`).join(' ') });
          }
        }

        if (!sections.length) return false;
        readingSectionsRef.current = sections;
        readingIndexRef.current    = 0;
        isReadingRef.current       = true;
        readingPausedRef.current   = false;
        setActiveContent({ label: `${displayBook} ${resolvedRef.chapter} (${displayTranslation})` });
      }

      if (!sections.length) return false;

      // ── VOICE READING START log (verifiable in browser DevTools) ─────────────
      console.info('[VOICE READING START]', JSON.stringify({
        content,
        entry:               sections[0]?.label ?? '',
        sectionsTotal:       sections.length,
        initialSectionIndex: 0,
        initialSectionLabel: sections[0]?.label ?? '',
      }));

      setStreamingResponse('');
      const uid = userRef.current?.id;
      const saved = uid ? loadVoiceReadingProgress(uid) : null;
      const canResume = saved
        && saved.resourceType === readingResourceRef.current.type
        && saved.resourceId === readingResourceRef.current.id
        && saved.sectionIndex >= 0
        && saved.sectionIndex < sections.length
        && !saved.completed;
      readingIndexRef.current = canResume ? saved.sectionIndex : 0;
      await playReadingSection(sections[readingIndexRef.current]);
      return true;
    }

    function buildEmmausContext(intent: VoiceIntent): FlatContext {
      const currentInitContext = initContextRef.current;
      const currentUser = userRef.current;
      const base: FlatContext = currentInitContext
        ? {
            ...currentInitContext,
            conversationId: convIdRef.current ?? currentInitContext.conversationId,
            userName: currentUser?.preferredName,
          }
        : {
            entryPoint: 'personal',
            conversationId: convIdRef.current ?? undefined,
            userName: currentUser?.preferredName,
          };

      const parts: string[] = [];
      const appCtx = appContextRef.current;

      if (appCtx) {
        const contentLines: string[] = [];
        if (appCtx.dailyRhythm) {
          const dr = appCtx.dailyRhythm;
          const stepInfo = dr.stepTitle ? `, step: "${dr.stepTitle}"` : '';
          contentLines.push(
            `• ${dr.journeyTitle} (also known as "Daily Rhythm" or "10 Minutes with Jesus") — Day ${dr.currentDay} of ${dr.totalDays}${stepInfo}`,
          );
        }
        for (const d of appCtx.activeDevotionals) {
          const entryInfo = d.entryTitle ? `, entry: "${d.entryTitle}"` : '';
          contentLines.push(`• ${d.seriesTitle} — Day ${d.currentDay} of ${d.totalDays}${entryInfo}`);
        }
        if (appCtx.sermonCompanion) {
          const sc = appCtx.sermonCompanion;
          const entryInfo = sc.entryTitle ? `, today: "${sc.entryTitle}"` : '';
          contentLines.push(`• Sermon Companion: "${sc.title}" — Day ${sc.currentDay} of ${sc.totalDays}${entryInfo}`);
        }
        for (const w of appCtx.activeWalks) {
          const stepInfo = w.stepTitle ? `, step: "${w.stepTitle}"` : '';
          contentLines.push(`• Walk: "${w.title}" — Day ${w.currentDay} of ${w.totalDays || '?'}${stepInfo} (type: walk)`);
        }
        if (contentLines.length > 0) {
          parts.push(`User's available content today:\n${contentLines.join('\n')}`);
        }
      }

      if (isReadingRef.current && readingSectionsRef.current.length > 0) {
        const section = readingSectionsRef.current[readingIndexRef.current];
        if (section) {
          parts.push(`Voice is currently reading: ${section.label}`);
          parts.push(section.text.slice(0, 500));
        }
      }

      if (!isReadingRef.current && lastReadSectionsRef.current.length > 0) {
        const lastSections = lastReadSectionsRef.current;
        const summary = lastSections
          .map((s) => `[${s.label}] ${s.text.slice(0, 300)}`)
          .join('\n');
        parts.push(`Content just read aloud (reading has ended — the user may ask follow-up questions about this):\n${summary}`);
      }

      const voiceAppContext = parts.length > 0 ? parts.join('\n\n') : undefined;

      if (bibleContextRef.current) {
        const bCtx = bibleContextRef.current;
        const translationNote     = `\nBible reading translation: ${bCtx.translationId.toUpperCase()}`;
        const enrichedVoiceCtx    = voiceAppContext ? voiceAppContext + translationNote : translationNote.trim();
        return { ...base, bookId: bCtx.bookId, chapter: bCtx.chapter, voiceAppContext: enrichedVoiceCtx };
      }

      if (appCtx?.dailyRhythm && (isReadingRef.current || intent.type === 'converse')) {
        const dr = appCtx.dailyRhythm;
        return { ...base, journeyId: dr.journeyId, journeyTitle: dr.journeyTitle, currentDay: dr.currentDay, voiceAppContext };
      }

      return { ...base, voiceAppContext };
    }

    // ── [VOICE INPUT TRACE] — diagnostic for physical-device testing ──────────
    {
      const audioDurationMs = Date.now() - recordingStartRef.current;
      const audioBytes      = blob.size;
      console.log('[VOICE INPUT TRACE]', JSON.stringify({
        audioDurationMs,
        audioBytes,
        ttsEndedAt:        ttsEndedAtRef.current ? new Date(ttsEndedAtRef.current).toISOString() : null,
        timeSinceTtsEnded: ttsEndedAtRef.current !== null ? Date.now() - ttsEndedAtRef.current : null,
      }));

      // ── Audio rejection gates ─────────────────────────────────────────────
      //
      // Gate 1: hadVoiceActivityRef — set by the VAD interval when ≥5
      // consecutive above-threshold ticks are detected (~500 ms of real speech).
      // Unlike vadSpokenRef, this ref is NOT cleared by clearVAD(), so it
      // retains the value from the recording session even though clearVAD()
      // always runs before recorder.onstop fires.  This correctly blocks
      // near-silence echo picked up after TTS playback ends.
      //
      // Gate 2: blob size floor — rejects MediaRecorder flush artifacts (a few
      // hundred bytes produced by recorder.stop() with no real audio).
      const MIN_BLOB_BYTES = 1000;

      const rejectedByVad      = !hadVoiceActivityRef.current;
      const rejectedByBlobSize = audioBytes < MIN_BLOB_BYTES;

      if (rejectedByVad || rejectedByBlobSize) {
        console.log('[VOICE AUDIO REJECTED]', JSON.stringify({
          reason:      rejectedByVad ? 'no_vad_speech_detected' : 'blob_too_small',
          duration:    audioDurationMs,
          bytes:       audioBytes,
          hadVoiceActivity: hadVoiceActivityRef.current,
          vadSpeechMs: null,
        }));
        if (isReadingRef.current && !readingPausedRef.current) {
          await advanceReading();
        } else {
          setVoiceState(tapToSpeakOnlyRef.current ? 'READY' : 'LISTENING');
          autoRestartTimerRef.current = setTimeout(() => {
            autoRestartTimerRef.current = null;
            if (!cancelledRef.current && !pausedRef.current && !tapToSpeakOnlyRef.current) startListening();
          }, 500);
        }
        return;
      }
    }

    // ── Main pipeline ─────────────────────────────────────────────────────────

    setVoiceState('THINKING');

    try {
      const audioBlob = blob.type ? blob : new Blob([blob], { type: mimeType });
      const text = await transcribeAudio(
        audioBlob,
        user.id,
        Math.max(0, Date.now() - recordingStartRef.current),
      );

      console.log('[VOICE CORE TRACE]', JSON.stringify({
        event:               'transcription_complete',
        audioBlobBytes:      blob.size,
        audioDurationMs:     Date.now() - recordingStartRef.current,
        transcriptionStarted: true,
        transcript:          text.trim().slice(0, 120),
        audioAccepted:       true,
        nextState:           text.trim() ? 'dispatch' : 'error_or_advance',
      }));

       if (cancelledRef.current || (turnId !== undefined && turnId !== voiceTurnRef.current)) return;

      if (!text.trim()) {
        if (isReadingRef.current && !readingPausedRef.current) { await advanceReading(); return; }
        setErrorMsg("I didn't catch that. Tap to try again.");
        setVoiceState('ERROR');
        return;
      }

      setTranscript(text);
      setStreamingResponse('');

      const intent = resolveIntent(text, isReadingRef.current);

      // ── [VOICE ACTION TRACE] — emitted after every classification ────────────
      // Sprint 2 routing:
      //   Fast-path (regex, no LLM): reading-command | navigate | continue-reading
      //   LLM tool dispatch (everything else): read-content, continue-walk,
      //     get-steps, converse — LLM decides tool or conversational reply
      const _isFastPath = (
        intent.type === 'navigate' ||
        intent.type === 'reading-command' ||
        intent.type === 'continue-reading'
      );
      console.log('[VOICE ACTION TRACE]', JSON.stringify({
        transcript:        text,
        classifiedIntent:  intent.type,
        dispatch:          _isFastPath ? 'fast-path-regex' : 'llm-tool-dispatch',
        navigationTarget:  intent.type === 'navigate' ? (intent as { target: string }).target : null,
        isReadingActive:   isReadingRef.current,
        voiceContextLoaded: !!appContextRef.current,
      }));

      // Bible OPEN is the only Bible action that may navigate. The route is
      // assembled from the parsed canonical reference, never from model prose.
      if (intent.type === 'open-bible') {
        const ref = intent.bibleRef;
        const route = ref
          ? `/bible/read/${ref.bookId}/${ref.chapter}${ref.verse ? `?startVerse=${ref.verse}` : ''}`
          : '/bible';
        if (!isSafeVoiceRoute(route)) {
          const message = 'I could not safely open that passage.';
          setResponse(message);
          await playTTS(message, false);
          return;
        }
        const label = ref
          ? `Opening ${ref.bookName} ${ref.chapter}${ref.verse ? `:${ref.verse}` : ''}.`
          : 'Opening My Bible.';
        setResponse(label);
        await playTTS(label, false);
        if (cancelledRef.current) return;
        const navFn = navigateRef.current ?? providerNavigateRef.current;
        if (navFn) navFn(route);
        else {
          window.history.pushState({}, '', route);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        return;
      }

      // Explicit READ actions are deterministic and do not need a model tool
      // call. This also keeps reading local: opening the player does not force
      // a full-page navigation.
      if (intent.type === 'read-content') {
        const args = {
          type: intent.content,
          ...(intent.bibleRef?.bookId ? { bibleBook: intent.bibleRef.bookId } : {}),
          ...(intent.bibleRef?.chapter ? { bibleChapter: intent.bibleRef.chapter } : {}),
          ...(intent.titleHint ? { titleHint: intent.titleHint } : {}),
        };
        const validation = validateVoiceReadAction(args, appContextRef.current);
        if (!validation.ok) {
          setResponse(validation.message);
          setStreamingResponse('');
          await playTTS(validation.message, false);
          return;
        }
        const bibleRef = intent.bibleRef
          ? {
              bookId: intent.bibleRef.bookId,
              bookName: intent.bibleRef.bookName,
              chapter: intent.bibleRef.chapter,
              ...(intent.bibleRef.translationId ? { translationId: intent.bibleRef.translationId } : {}),
            }
          : undefined;
        const started = await loadAndStartReading(
          validation.content,
          bibleRef,
          validation.titleHint,
        );
        if (!started) {
          const message = 'I wasn’t able to load that reading. Please try again.';
          setResponse(message);
          setStreamingResponse('');
          await playTTS(message, false);
        }
        return;
      }

      // Continue/open a named Walk from the server-provided Voice context.
      // The client only uses the exact active journey ID and current day
      // supplied by the authenticated context endpoint.
      if (intent.type === 'continue-walk') {
        const walks = appContextRef.current?.activeWalks ?? [];
        const normalizedHint = intent.hint?.toLowerCase().trim();
        const matches = normalizedHint
          ? walks.filter((walk) => walk.title.toLowerCase().includes(normalizedHint))
          : walks;
        const walk = matches.length === 1 ? matches[0] : null;
        if (walk) {
          const route = `/journey/${walk.journeyId}/day/${walk.currentDay}`;
          if (!isSafeVoiceRoute(route)) {
            const message = 'I could not safely open that Walk.';
            setResponse(message);
            await playTTS(message, false);
            return;
          }
          const message = `Continuing ${walk.title}, Day ${walk.currentDay}.`;
          setResponse(message);
          await playTTS(message, false);
          if (cancelledRef.current) return;
          const navFn = navigateRef.current ?? providerNavigateRef.current;
          if (navFn) navFn(route);
          else {
            window.history.pushState({}, '', route);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
          return;
        }
        if (walks.length > 1) {
          const message = `I found more than one active Walk: ${walks.map((walk) => walk.title).join(', ')}. Which one should we continue?`;
          setHistory((prev) => [
            ...prev,
            { role: 'user' as const, content: text },
            { role: 'assistant' as const, content: message },
          ]);
          setResponse(message);
          await playTTS(message, false);
          return;
        }
        if (walks.length === 0) {
          const message = 'I could not find an active Walk to continue.';
          setResponse(message);
          await playTTS(message, false);
          return;
        }
      }

      // "Play it" may refer to the last verified sermon card. The only route
      // accepted here is the route returned by canonical sermon retrieval.
      if (intent.type === 'play-sermon') {
        const sermon = sermonResultsRef.current[0];
        const route = sermon?.listenPath ?? sermon?.openPath;
        if (route && isSafeVoiceRoute(route)) {
          const message = sermon?.listenPath
            ? `Playing ${sermon.title}.`
            : `Opening ${sermon.title}.`;
          setResponse(message);
          await playTTS(message, false);
          if (cancelledRef.current) return;
          const navFn = navigateRef.current ?? providerNavigateRef.current;
          if (navFn) navFn(route);
          else {
            window.history.pushState({}, '', route);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
          return;
        }
      }

      // ── Reading commands ────────────────────────────────────────────────────
      if (intent.type === 'reading-command') {
        const { command } = intent;
        if (command === 'pause') {
          readingPausedRef.current = true;
          cancelAutoRestart();
          stopAudio();
          setVoiceState('READY');
          return;
        }
        if (command === 'continue') {
          readingPausedRef.current = false;
          await playReadingSection(readingSectionsRef.current[readingIndexRef.current]);
          return;
        }
        if (command === 'repeat') {
          readingPausedRef.current = false;
          await playReadingSection(readingSectionsRef.current[readingIndexRef.current]);
          return;
        }
        if (command === 'next-section') {
          readingPausedRef.current = false;
          await advanceReading();
          return;
        }
        readingPausedRef.current = true;
      }

      // ── Navigation ───────────────────────────────────────────────────────────
      if (intent.type === 'navigate') {
        const routes: Record<string, string> = {
          walk: '/walk', bible: '/bible', discover: '/discover', journeys: '/journeys',
        };
        if (intent.target === 'back') {
          goBackOrFallback('/personal/ask-emmaus', (path) => {
            const navFn = navigateRef.current ?? providerNavigateRef.current;
            if (navFn) navFn(path);
            else window.location.assign(path);
          });
          // Restart listening after navigating back (small delay for page to settle)
          autoRestartTimerRef.current = setTimeout(() => {
            autoRestartTimerRef.current = null;
            if (!cancelledRef.current && !pausedRef.current && !tapToSpeakOnlyRef.current) startListening();
          }, 1200);
          return;
        }
        const route = routes[intent.target] ?? '/walk';
        // Prefer VoiceMode's registered navigate; fall back to provider-level navigate
        const navFn = navigateRef.current ?? providerNavigateRef.current;
        console.log('[VOICE]', JSON.stringify({ navigationRoute: route, hasFn: !!navFn }));
        if (navFn) {
          navFn(route);
        } else {
          // Last resort: use browser history API
          window.history.pushState({}, '', route);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        // Restart listening after navigation so the session continues on the new screen
        autoRestartTimerRef.current = setTimeout(() => {
          autoRestartTimerRef.current = null;
          if (!cancelledRef.current && !pausedRef.current && !tapToSpeakOnlyRef.current) startListening();
        }, 1200);
        return;
      }

      // ── Continue reading (fast path — unambiguous chapter navigation) ────────
      if (intent.type === 'continue-reading') {
        if (isReadingRef.current && !readingPausedRef.current && intent.direction !== 'previous') {
          await advanceReading();
          return;
        }
        if (bibleContextRef.current) {
          const { bookId, chapter, translationId } = bibleContextRef.current;
          const targetChapter = intent.direction === 'previous' ? chapter - 1 : chapter + 1;
          if (targetChapter >= 1) {
            const started = await loadAndStartReading('bible', { bookId, bookName: bookId, chapter: targetChapter, translationId });
            if (started) return;
          }
        }
      }

      // ── LLM tool dispatch ─────────────────────────────────────────────────────
      //
      // Sprint 2: all remaining intents (read-content, continue-walk, get-steps,
      // converse) are sent to POST /api/voice/conversation with tool definitions.
      // The model decides whether to call read_content, navigate, or respond
      // conversationally — no rigid command vocabulary required from the user.
      //
      // Fast paths kept above (reading-command / navigate / continue-reading) are
      // deterministic, zero-latency, and need no LLM involvement.

       if (turnId !== undefined && turnId !== voiceTurnRef.current) return;

       const emmausCtx    = buildEmmausContext(intent);
      const voiceAppCtx  = emmausCtx.voiceAppContext;
      const lastReadCtx  = !isReadingRef.current && lastReadSectionsRef.current.length > 0
        ? lastReadSectionsRef.current.map((s) => `[${s.label}] ${s.text.slice(0, 300)}`).join('\n')
        : undefined;

      let toolCallPending: AnyVoiceToolCall | null = null;
      let hadToolCall = false;
      let fullResponse = '';
      let canonicalActionRoute: string | null = null;
      let canonicalActionLabel: string | null = null;

      // ── Start interrupt monitor NOW (before the LLM call) ────────────────────
      // Previously the monitor was only started inside playReadingSection, so the
      // user could never interrupt a conversational response.  Starting it here,
      // before the LLM request fires, means the 1-second startup delay elapses
      // during LLM latency (free time) — the monitor is already active when TTS
      // starts playing.  The guard (intStreamRef.current) makes this idempotent:
      // if a reading session already started the monitor it stays alive as-is.
      //
      // interruptFired: local flag that stops the sentence drain loop and aborts
      // the SSE stream when a barge-in fires.  Without it, the old drain loop
      // keeps running and tries to play the next queued sentence over the user's
      // new recording.
      let interruptFired = false;
      startInterruptMonitor((capture) => {
        interruptFired = true;
        abortRef.current?.();   // abort any in-flight LLM SSE stream
        abortRef.current = null;
        stopAudio();
        setStreamingResponse('');
        startListeningFromCapture(capture);
      });

      // ── Sentence streaming queue ──────────────────────────────────────────────
      // Sentences from the server are played via TTS as they arrive so the user
      // hears Emmaus start speaking within 1-2 s of finishing their question,
      // rather than waiting for the full LLM response.  Only used for
      // conversational (non-tool-call) responses.
      //
      // ORDERING INVARIANT: the server always emits { type:'sentence' } before
      // { type:'done' } for any non-empty conversational response (including the
      // trailing-fragment flush at finishReason==='stop').  The SSE reader in
      // voice-conversation-client.ts calls onSentence during the read loop and
      // calls onDone only after the loop ends, so sentenceEverEnqueued is
      // guaranteed to be true before the outer Promise resolves whenever the
      // server emitted at least one sentence.  This makes the fallback branch
      // below safe from double-speaking.
      const sentenceQueue: string[] = [];
      let   sentenceQueueDone    = false;
      let   sentenceQueueWaker: (() => void) | null = null;
      let   sentenceQueueActive  = false;
      // sentenceEverEnqueued is set to true the first time a valid sentence is
      // pushed to the queue.  It is never cleared, so the fallback guard below
      // can reliably distinguish "no sentences ever arrived" from "drain already
      // finished" — the two cases that produce an identical sentenceQueueActive
      // value after the drain loop exits.
      let   sentenceEverEnqueued = false;
      let   drainPromise: Promise<void> | null = null;

      /**
       * Play sentences from the queue sequentially, waiting for more to arrive
       * when the queue empties before the stream has finished.
       * Cancels the post-TTS auto-restart timer before each sentence so that the
       * previous sentence's 1-second delay doesn't fire the mic while a new
       * sentence is already queued.
       * Stops immediately when interruptFired — barge-in owns what happens next.
       */
      async function drainAndPlaySentences(): Promise<void> {
        while (true) {
          if (interruptFired || cancelledRef.current) return;
          if (sentenceQueue.length > 0) {
            cancelAutoRestart(); // clear timer set by previous playTTS onended
            const sentence = sentenceQueue.shift()!;
            if (!cancelledRef.current && !interruptFired) {
              await playTTS(sentence, false);
            }
            if (cancelledRef.current || interruptFired) return;
          } else if (sentenceQueueDone) {
            return;
          } else {
            // Cancel any auto-restart timer that fired while we waited for the
            // next sentence — prevents the mic from opening between sentences.
            cancelAutoRestart();
            await new Promise<void>((r) => { sentenceQueueWaker = r; });
          }
        }
      }

      function enqueueSentence(sentence: string) {
        if (!sentence.trim() || hadToolCall || interruptFired) return;
        sentenceEverEnqueued = true; // set before drain starts; survives drain completion
        sentenceQueue.push(sentence);
        if (!sentenceQueueActive) {
          sentenceQueueActive = true;
          drainPromise = drainAndPlaySentences();
        } else if (sentenceQueueWaker) {
          const wake = sentenceQueueWaker;
          sentenceQueueWaker = null;
          wake();
        }
      }

      await new Promise<void>((resolve, reject) => {
        const handle = sendVoiceConversation({
          message:         text,
          userId:          user.id,
          context:         emmausCtx,
          currentPath:     window.location.pathname,
          history:         history,
          voiceAppContext: voiceAppCtx,
          isReading:       isReadingRef.current,
          lastReadContext: lastReadCtx,
          callbacks: {
            onText: (chunk) => {
              if (cancelledRef.current) return;
              fullResponse += chunk;
              setStreamingResponse(fullResponse);
            },
            // Each complete sentence is dispatched to TTS immediately so the
            // user hears the first sentence before the LLM finishes responding.
            onSentence: (sentence) => {
              if (cancelledRef.current) return;
              enqueueSentence(sentence);
            },
            // Collect the tool call — executed after stream ends so any brief
            // confirmation text can be spoken before or instead of the action.
            onToolCall: (tc) => {
              hadToolCall = true;
              toolCallPending = tc;
              console.log('[VOICE TOOL CALL]', JSON.stringify({ tool: tc.tool, args: tc.args }));
            },
            onDone: (_finalText, _hadTool, info?: VoiceDoneInfo) => {
               if (info?.conversationId) setConvId(info.conversationId);
               if (info?.metadata?.sermonRecommendations) {
                 setSermonResults(info.metadata.sermonRecommendations);
               }
               if (intent.type === 'open-resource') {
                 const active = appContextRef.current;
                 const activeTarget =
                   intent.target === 'sermon-companion' && active?.sermonCompanion
                     ? `/sermon-companion/${active.sermonCompanion.id}/overview`
                     : intent.target === 'devotional' && active?.activeDevotionals[0]
                       ? `/devotional/${active.activeDevotionals[0].seriesId}/day/${active.activeDevotionals[0].currentDay}`
                       : intent.target === 'progress'
                         ? '/personal'
                         : intent.target === 'saved-reading'
                           ? '/bible/history'
                           : null;
                 const rec = info?.metadata?.recommendations?.find((item) => {
                   if (intent.target === 'sermon') return false;
                   if (intent.target === 'journey') return item.type === 'journey' || item.type === 'walk';
                   if (intent.target === 'bible-study') return item.type === 'bible-study';
                   if (intent.target === 'devotional') return item.type === 'devotional';
                   if (intent.target === 'sermon-companion') return item.type === 'sermon-companion';
                   return false;
                 });
                 const sermon = intent.target === 'sermon'
                   ? info?.metadata?.sermonRecommendations?.[0] ?? sermonResultsRef.current[0]
                   : undefined;
                 const route = activeTarget ?? sermon?.openPath ?? rec?.path ?? null;
                 if (route && isSafeVoiceRoute(route)) {
                   canonicalActionRoute = route;
                   canonicalActionLabel = sermon
                     ? `Opening ${sermon.title}.`
                     : activeTarget
                       ? 'Opening that verified Emmaus resource.'
                       : `Opening ${rec?.title ?? 'that verified Emmaus resource'}.`;
                 }
               }
              if (!_hadTool && !cancelledRef.current) {
                // Pure conversation — persist to local history for multi-turn context
                setHistory((prev) => [
                  ...prev,
                  { role: 'user' as const,      content: text },
                  { role: 'assistant' as const, content: fullResponse },
                ]);
              }
              // Signal drain loop that no more sentences are coming
              sentenceQueueDone = true;
              if (sentenceQueueWaker) {
                const wake = sentenceQueueWaker;
                sentenceQueueWaker = null;
                wake();
              }
              resolve();
            },
            onError: (msg) => reject(new Error(msg)),
          },
        });
        abortRef.current = handle.abort;
      });

      abortRef.current = null;
      if (cancelledRef.current) return;

      if (canonicalActionRoute) {
        setResponse(canonicalActionLabel ?? 'Opening that verified Emmaus resource.');
        setStreamingResponse('');
        const navFn = navigateRef.current ?? providerNavigateRef.current;
        if (navFn) navFn(canonicalActionRoute);
        else {
          window.history.pushState({}, '', canonicalActionRoute);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        return;
      }

      // ── Execute pending tool call ─────────────────────────────────────────────
      if (hadToolCall && toolCallPending) {
        const tc = toolCallPending as AnyVoiceToolCall;

        if (tc.tool === 'read_content') {
          // Reading IS the response — do not TTS any accompanying text.
          const args = tc.args as {
            type:          string;
            bibleBook?:    string;
            bibleChapter?: number;
            titleHint?:    string;
          };
          const validation = validateVoiceReadAction(args, appContextRef.current);
          if (!validation.ok) {
            console.warn('[VOICE ACTION REJECTED]', JSON.stringify({
              code: validation.code,
              action: 'read-content',
              contentType: args.type ?? null,
            }));
            setResponse(validation.message);
            setStreamingResponse('');
            await playTTS(validation.message, false);
            return;
          }
          let bibleRef: { bookId: string; bookName: string; chapter: number } | undefined;
          if (validation.content === 'bible' && validation.bibleBook && validation.bibleChapter) {
            // Normalise: strip spaces/hyphens so "1 corinthians" → "1corinthians"
            bibleRef = { bookId: validation.bibleBook, bookName: validation.bibleBook, chapter: validation.bibleChapter };
          }
          const started = await loadAndStartReading(
            validation.content,
            bibleRef,
            validation.titleHint,
          );
          if (!started) {
            // Log the real failure so it's visible in DevTools (not hidden behind a friendly string)
            const errorCode =
              args.type === 'daily-rhythm'      ? 'VOICE_RESOLVER_NO_ACTIVE_DAILY_RHYTHM' :
              args.type === 'devotional'         ? 'VOICE_RESOLVER_ENTRY_NOT_FOUND_DEVOTIONAL' :
              args.type === 'sermon-companion'   ? 'VOICE_RESOLVER_NO_SERMON_COMPANION' :
              args.type === 'bible'              ? 'VOICE_RESOLVER_BIBLE_FETCH_FAILED' :
                                                   'VOICE_RESOLVER_UNKNOWN_CONTENT_TYPE';
            console.error('[VOICE CONTENT BRIDGE FAILED]', JSON.stringify({
              errorCode,
              toolArgs: args,
              appContextLoaded: !!appContextRef.current,
              dailyRhythmInContext: !!appContextRef.current?.dailyRhythm,
              activeDevotionalsCount: appContextRef.current?.activeDevotionals?.length ?? 0,
            }));
            const errMsg = `I wasn't able to load that content. Check My Emmaus to see what's available.`;
            setResponse(errMsg);
            setStreamingResponse('');
            await playTTS(errMsg, false);
          }
          return;
        }

        if (tc.tool === 'navigate') {
          const args = tc.args as {
            destination: string;
            bibleBookId?: string;
            bibleChapter?: number;
            resolvedRoute?: string;
          };
          const routes: Record<string, string> = {
            walk: '/walk', bible: '/bible', discover: '/discover', journeys: '/journeys',
          };
          // Prefer server-resolved route (deep Bible chapter link) over generic lookup
          const finalRoute =
            args.resolvedRoute ??
            (args.destination === 'back' ? 'HISTORY_BACK' : (routes[args.destination] ?? '/walk'));
          if (args.destination !== 'back' && !isSafeVoiceRoute(finalRoute)) {
            console.warn('[VOICE ACTION REJECTED]', JSON.stringify({
              code: 'VOICE_UNSAFE_ROUTE',
              action: 'navigate',
              destination: args.destination,
            }));
            const safeMessage = 'I could not safely open that destination.';
            setResponse(safeMessage);
            setStreamingResponse('');
            await playTTS(safeMessage, false);
            return;
          }
          const isChapterNav = !!(args.bibleBookId && args.bibleChapter);
          const navFnName = navigateRef.current ? 'navigateRef' : providerNavigateRef.current ? 'providerNavigateRef(wouter)' : 'window.history.pushState';
          console.info('[VOICE TOOL NAV TRACE]', JSON.stringify({
            toolName:             'navigate',
            toolArguments:        args,
            requestedDestination: args.destination,
            bibleBookId:          args.bibleBookId ?? null,
            bibleChapter:         args.bibleChapter ?? null,
            resolvedRoute:        finalRoute,
            isChapterNav,
            routerFunctionUsed:   navFnName,
            navigationCalled:     true,
          }));
          // Bible-specific canonical nav log
          if (args.destination === 'bible') {
            const route = isChapterNav ? finalRoute : '/bible';
            console.info('[VOICE BIBLE NAV]', JSON.stringify({
              utterance:         text ?? '(unavailable)',
              toolCall:          isChapterNav
                ? `navigate({ destination: "bible", bibleBookId: "${args.bibleBookId}", bibleChapter: ${args.bibleChapter} })`
                : 'navigate({ destination: "bible" })',
              canonicalAction:   `${navFnName}("${route}")`,
              route,
              routeMatched:      true,
              finalURL:          route,
              renderedComponent: isChapterNav
                ? `ChapterReader (/bible/read/${args.bibleBookId}/${args.bibleChapter})`
                : 'Bible (src/pages/Bible.tsx)',
              success:           !!(navigateRef.current ?? providerNavigateRef.current),
            }));
          }
          // Speak brief confirmation text first (e.g. "Opening John 3.")
          if (fullResponse.trim()) {
            setResponse(fullResponse);
            setStreamingResponse('');
            await playTTS(fullResponse, false);
            if (cancelledRef.current) return;
          }
          if (args.destination === 'back' && !args.resolvedRoute) {
            goBackOrFallback('/personal/ask-emmaus', (path) => {
              const navFn = navigateRef.current ?? providerNavigateRef.current;
              if (navFn) navFn(path);
              else window.location.assign(path);
            });
          } else {
            const navFn = navigateRef.current ?? providerNavigateRef.current;
            if (navFn) navFn(finalRoute);
            else { window.history.pushState({}, '', finalRoute); window.dispatchEvent(new PopStateEvent('popstate')); }
          }
          if (!fullResponse.trim()) {
            // No TTS — restart listening after navigation settles
            autoRestartTimerRef.current = setTimeout(() => {
              autoRestartTimerRef.current = null;
              if (!cancelledRef.current && !pausedRef.current && !tapToSpeakOnlyRef.current) startListening();
            }, 1200);
          }
          // If TTS was spoken, its onended handler restarts listening automatically
          return;
        }

        if (tc.tool === 'continue_walk') {
          // The server resolved the walk server-side and returned either a direct
          // route or a clarification prompt (zero / multiple active walks).
          const args = tc.args as { route?: string; prompt?: string; journeyTitle?: string; currentDay?: number };

          if (args.prompt) {
            // Speak clarification or "no walks" message, then re-open the mic.
            // Persist this exchange to history so the LLM has full context on the
            // next turn — the user's follow-up ("Walk A") will arrive as the new
            // user message, and the LLM will call continue_walk({ titleHint: 'Walk A' }).
            setHistory((prev) => [
              ...prev,
              { role: 'user' as const,      content: text },
              { role: 'assistant' as const, content: args.prompt! },
            ]);
            setResponse(args.prompt);
            setStreamingResponse('');
            await playTTS(args.prompt, false);
            return;
          }

          if (args.route && isSafeVoiceRoute(args.route)) {
            // Speak any brief LLM confirmation text first, then navigate
            if (fullResponse.trim()) {
              setResponse(fullResponse);
              setStreamingResponse('');
              await playTTS(fullResponse, false);
              if (cancelledRef.current) return;
            }
            const navFn = navigateRef.current ?? providerNavigateRef.current;
            console.log('[VOICE]', JSON.stringify({ continueWalkRoute: args.route, hasFn: !!navFn }));
            if (navFn) {
              navFn(args.route);
            } else {
              window.history.pushState({}, '', args.route);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
            if (!fullResponse.trim()) {
              autoRestartTimerRef.current = setTimeout(() => {
                autoRestartTimerRef.current = null;
                if (!cancelledRef.current && !pausedRef.current && !tapToSpeakOnlyRef.current) startListening();
              }, 1200);
            }
          } else if (args.route) {
            console.warn('[VOICE ACTION REJECTED]', JSON.stringify({
              code: 'VOICE_UNSAFE_ROUTE',
              action: 'continue-walk',
            }));
            const safeMessage = 'I could not safely open that Walk.';
            setResponse(safeMessage);
            setStreamingResponse('');
            await playTTS(safeMessage, false);
          }
          return;
        }

        if (tc.tool === 'search_sermons') {
          // Server resolved the search against published canonical records.
          const args = tc.args as {
            spokenText: string;
            sermonResults?: SermonRecommendation[];
            selectedSermonPath?: string;
          };
          setSermonResults(Array.isArray(args.sermonResults) ? args.sermonResults : []);
          setResponse(args.spokenText);
          setStreamingResponse('');
          await playTTS(args.spokenText, false);
          if (cancelledRef.current) return;
          if (args.selectedSermonPath && isSafeVoiceRoute(args.selectedSermonPath)) {
            const navFn = navigateRef.current ?? providerNavigateRef.current;
            if (navFn) navFn(args.selectedSermonPath);
            else {
              window.history.pushState({}, '', args.selectedSermonPath);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }
          // playTTS onended will restart listening automatically
          return;
        }
      }

      // ── No tool — pure conversational response ────────────────────────────────
      if (!fullResponse.trim()) { setVoiceState('READY'); return; }
      setResponse(fullResponse);
      setStreamingResponse('');

      // If sentence streaming was used (sentences arrived during the LLM stream),
      // await the drain promise — playback already started on the first sentence,
      // so the user has been hearing Emmaus speak since ~1-2 s after they spoke.
      // The last sentence's playTTS onended handler will schedule the mic restart.
      //
      // DOUBLE-SPEAK GUARD: sentenceEverEnqueued is the authoritative flag for
      // "at least one sentence was enqueued".  It is set before the drain loop
      // starts and is never cleared, so it remains true even after drainPromise
      // resolves — unlike sentenceQueueActive which serves the same purpose but
      // could in principle be confused with a "drain loop already exited" state.
      // Only take the fallback branch when NO sentence ever arrived; in that
      // case the full response is guaranteed to be unplayed.
      if (sentenceEverEnqueued && drainPromise) {
        // Drain loop already started (and may have already resolved); awaiting
        // a resolved promise is a no-op, so this is safe in all timings.
        await drainPromise;
      } else {
        // No sentence events arrived from the server (e.g. empty sentenceBuf at
        // finishReason==='stop' after flushSentences already consumed all text,
        // or a tool-call-only response that produced no delta.content at all —
        // which should be unreachable here because hadToolCall routes above).
        // Speak the full response exactly once.
        await playTTS(fullResponse, false);
      }

    } catch (err) {
      if (cancelledRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Tap to try again.');
      setVoiceState('ERROR');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — reads all dynamic values from refs

  // Keep the stable ref up to date
  useEffect(() => { processAudioBlobRef.current = processAudioBlob; }, [processAudioBlob]);

  // ─── navigate ref (set by VoiceMode when mounted, survives unmount) ────────
  // Since the session outlives VoiceMode, we need a way to navigate from
  // processAudioBlob after the view has unmounted (e.g. "Open My Bible" while
  // on a different screen is impossible — but navigate commands only fire when
  // the user is actively speaking, so VoiceMode is likely the current route).
  // We store the navigate function so it's always current.
  const navigateRef = useRef<((to: string) => void) | null>(null);

  /** Called by VoiceMode on mount/update to register the current navigate fn. */
  const registerNavigate = useCallback((fn: (to: string) => void) => {
    navigateRef.current = fn;
  }, []);

  // ─── Opening greeting ─────────────────────────────────────────────────────
  /**
   * Play a short personalised greeting when a session opens, then start listening.
   * Silently skips to listening if TTS fails or autoplay is blocked.
   *
   * AUTOPLAY STRATEGY — two-tier:
   *
   *   Tier 1 (Web Audio API — preferred, iOS-safe):
   *     unlockVoiceAudio() is called synchronously in the UI tap handler that
   *     opens Voice Mode (UnifiedEmmausInput.handleMic, AskEmmausHome onClick).
   *     That creates and resumes an AudioContext which stays in 'running' state
   *     permanently after a user gesture.  Here we fetch TTS as an ArrayBuffer,
   *     decode it with audioContext.decodeAudioData(), and play via an
   *     AudioBufferSourceNode — the AudioContext was unlocked before any async
   *     work started, so no new gesture is required.
   *
   *   Tier 2 (HTMLAudioElement — fallback for non-iOS browsers):
   *     When no running AudioContext is available we fall back to the old
   *     HTMLAudioElement path.  If autoplay is still blocked (NotAllowedError)
   *     we catch it and fall through silently to startListening().
   */
  async function playGreeting(text: string): Promise<void> {
    if (cancelledRef.current) return;
    setVoiceState('SPEAKING');
    console.info('[VOICE GREETING]', JSON.stringify({
      event: 'greetingAttempted',
      textLength: text.length,
      provider: 'device',
    }));
    try {
      const speech = speakWithDevice(text, {
        rate: Math.max(0.5, Math.min(2, voiceSpeedRef.current)),
        voice: deviceVoiceRef.current,
      });
      deviceSpeechRef.current = speech;
      await speech.promise;
      if (deviceSpeechRef.current === speech) {
        deviceSpeechRef.current = null;
        console.info('[VOICE GREETING]', JSON.stringify({ event: 'greetingCompleted', provider: 'device' }));
      }
    } catch (err) {
      console.warn('[VOICE GREETING]', JSON.stringify({
        event: 'deviceSpeechUnavailable',
        error: String(err),
      }));
    }
    if (!cancelledRef.current) setVoiceState('READY');
    if (!cancelledRef.current && !tapToSpeakOnlyRef.current) startListening();
    return;

  }

  // ─── Session lifecycle ────────────────────────────────────────────────────

  const startSession = useCallback((context?: FlatContext) => {
    cancelledRef.current = false;
    pausedRef.current    = false;
    setIsActive(true);
    setSessionPaused(false);
    setVoiceState('READY');
    setTranscript('');
    setResponse('');
    setStreamingResponse('');
    setErrorMsg(null);
    setTtsError(false);
    setAutoplayBlocked(false);
    setActiveContent(null);
    setSermonResults([]);
    if (context) {
      setInitContext(context);
      initContextRef.current = context;
    }

    // ── Pick up the AudioContext unlocked in the UI tap handler ──────────────
    // unlockVoiceAudio() is called synchronously in UnifiedEmmausInput.handleMic
    // and AskEmmausHome's onClick — both of which are direct user-gesture handlers
    // that run BEFORE React navigation and this useEffect.  The cached running
    // AudioContext is retrieved here so playGreeting can use it for Web Audio
    // playback without needing a new gesture.
    const unlockedAc = getUnlockedAudioContext();
    if (unlockedAc && playbackAcRef.current !== unlockedAc) {
      playbackAcRef.current?.close().catch(() => {});
      playbackAcRef.current = unlockedAc;
    }

    // Fetch voice settings + app context in parallel so VAD tuning is applied
    // before the very first startListening() call (no race between the two fetches).
    const uid = userRef.current?.id;
    if (uid) {
      Promise.all([
        getVoiceSettings(uid).catch(() => null),
        fetchVoiceContext(uid).catch(() => null),
      ]).then(([vs, ctx]) => {
        if (cancelledRef.current) return;

        // Apply admin-tuned VAD parameters — must happen before startListening().
        if (vs) {
          voiceSpeedRef.current = vs.speed ?? 1;
          deviceVoiceRef.current = selectDeviceVoice(
            typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [],
          );
          vadSettingsRef.current = {
            threshold: vs.vadThreshold ?? 50,
            ticks:     vs.vadTicks     ?? 6,
          };
        }

        if (!ctx) {
          // No content context — start listening straight away.
          if (!cancelledRef.current && !tapToSpeakOnlyRef.current) startListening();
          return;
        }
        appContextRef.current = ctx;
        const greetingText = buildOpeningGreeting(ctx, userRef.current?.preferredName);
        // Normal Voice is tap-to-speak: do not open the microphone or autoplay
        // a greeting on session entry. The user explicitly starts each turn.
        console.info('[VOICE GREETING]', JSON.stringify({
          event: 'greetingDeferred',
          hadActiveContent: Boolean(greetingText),
          reason: 'tap_to_speak_only',
        }));
      }).catch(() => {
      if (!cancelledRef.current && !tapToSpeakOnlyRef.current) startListening();
      });
    } else {
      if (!tapToSpeakOnlyRef.current) startListening();
    }
    setupMediaSessionHandlers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endSession = useCallback(() => {
    console.log('[VOICE STOP TRACE]', JSON.stringify({
      tapReceived:   true,
      recorderActive: Boolean(recorderRef.current),
      ttsActive:     Boolean(audioElRef.current),
      timerPending:  Boolean(autoRestartTimerRef.current),
      sessionEnded:  true,
    }));
    cancelledRef.current = true;
    pausedRef.current    = false;
    cleanupAll();
    setIsActive(false);
    setSessionPaused(false);
    setVoiceState('READY');
    setTranscript('');
    setResponse('');
    setStreamingResponse('');
    setErrorMsg(null);
    setTtsError(false);
    setAutoplayBlocked(false);
    setActiveContent(null);
    setConvId(null);
    setHistory([]);
    setInitContext(null);
    isReadingRef.current        = false;
    readingPausedRef.current    = false;
    bibleContextRef.current     = null;
    readingSectionsRef.current  = [];
    readingIndexRef.current     = 0;
    lastReadSectionsRef.current = [];
    appContextRef.current       = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const voiceOwnerRef = useRef<string | null>(user?.id ?? null);
  useEffect(() => {
    const nextSubject = user?.id ?? null;
    if (voiceOwnerRef.current && voiceOwnerRef.current !== nextSubject) {
      endSession();
    }
    voiceOwnerRef.current = nextSubject;
  }, [user?.id, endSession]);

  const pauseSession = useCallback(() => {
    if (!isActive) return;
    pausedRef.current = true;
    setSessionPaused(true);
    cancelAutoRestart();
    // Stop mic; preserve all session state
    cancelRecorder();
    audioElRef.current?.pause();
    if (isReadingRef.current) readingPausedRef.current = true;
    setVoiceState('READY');
    try { navigator.mediaSession.playbackState = 'paused'; } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const resumeSession = useCallback(() => {
    if (!isActive) return;
    pausedRef.current = false;
    setSessionPaused(false);
    const audio = audioElRef.current;
    if (audio) {
      if (isReadingRef.current) readingPausedRef.current = false;
      setVoiceState('SPEAKING');
      audio.play().catch(() => {
        setTtsError(true);
        setVoiceState('READY');
      });
    } else {
      startListening();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const stopPlayback = useCallback(() => {
    cancelAutoRestart();
    stopAudio();
    isReadingRef.current = false;
    readingPausedRef.current = false;
    readingSectionsRef.current = [];
    readingIndexRef.current = 0;
    setActiveContent(null);
    setSessionPaused(false);
    pausedRef.current = false;
    setVoiceState('READY');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateVisualContext = useCallback((ctx: FlatContext) => {
    setInitContext(ctx);
    initContextRef.current = ctx;
  }, []);

  // ─── Route change — refresh app context ──────────────────────────────────
  // When the user navigates while Voice is active, refresh the voice context
  // so "what's on this page?" is always accurate. Debounced to avoid hammering.

  const contextRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isActive) return;
    const uid = userRef.current?.id;
    if (!uid) return;

    // Debounce by 800ms so rapid nav taps don't spam the API
    if (contextRefreshTimerRef.current) clearTimeout(contextRefreshTimerRef.current);
    contextRefreshTimerRef.current = setTimeout(() => {
      fetchVoiceContext(uid).then((ctx) => { if (ctx) appContextRef.current = ctx; });
    }, 800);

    return () => {
      if (contextRefreshTimerRef.current) clearTimeout(contextRefreshTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, isActive]);

  // ─── Page visibility handling ─────────────────────────────────────────────
  // When the browser tab is hidden: preserve session, don't destroy.
  // When it becomes visible again: if session is active and paused/ready, optionally resume.

  useEffect(() => {
    function handleVisibilityChange() {
      if (!isActive) return;
      if (document.hidden) {
        // Tab backgrounded — audio may continue (browser-dependent).
        // If the recorder is running, the OS may suspend it. We keep session state
        // but can't guarantee mic continues (browser security restriction).
        // No action needed — the session is preserved.
      } else {
        // Tab restored — if we were in an error or forced stop, reset to READY
        // so the user can tap to continue without ending the session.
        if (voiceState === 'ERROR') setVoiceState('READY');
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isActive, voiceState]);

  // ─── Orb tap ──────────────────────────────────────────────────────────────

  const handleOrbTap = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        if (!playbackAcRef.current || playbackAcRef.current.state === 'closed') {
          playbackAcRef.current = new Ctx();
        }
        playbackAcRef.current.resume().catch(() => {});
      }
    } catch { /* ignore */ }

    cancelAutoRestart();
    setSessionPaused(false);

    if (autoplayBlocked) stopAudio();

    switch (voiceState) {
      case 'READY':
      case 'ERROR':
        setErrorMsg(null);
        startListening();
        break;
      case 'LISTENING':
        // Manual stop — user intentionally tapped to end their turn.
        // Bypass the VAD gate so this audio is always sent to transcription,
        // regardless of whether the VAD threshold fired during the recording.
        hadVoiceActivityRef.current = true;
        stopListening();
        break;
      case 'SPEAKING':
        stopAudio();
        setStreamingResponse('');
        startListening();
        break;
      case 'THINKING':
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState, autoplayBlocked]);

  // ─── Tap-to-play fallback ─────────────────────────────────────────────────

  const handleTapToHear = useCallback(() => {
    if (!response) return;
    setAutoplayBlocked(false);
    setVoiceState('SPEAKING');
    const speech = speakWithDevice(response, {
      rate: Math.max(0.5, Math.min(2, voiceSpeedRef.current)),
      voice: deviceVoiceRef.current,
    });
    deviceSpeechRef.current = speech;
    speech.promise
      .then(() => {
        if (deviceSpeechRef.current !== speech) return;
        deviceSpeechRef.current = null;
        setVoiceState('READY');
      })
      .catch(() => {
        if (deviceSpeechRef.current !== speech) return;
        deviceSpeechRef.current = null;
        setTtsError(true);
        setVoiceState('READY');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Retry audio ──────────────────────────────────────────────────────────

  const handleRetryAudio = useCallback(async () => {
    if (!response) return;
    setTtsError(false);
    setVoiceState('SPEAKING');
    try {
      const speech = speakWithDevice(response, {
        rate: Math.max(0.5, Math.min(2, voiceSpeedRef.current)),
        voice: deviceVoiceRef.current,
      });
      deviceSpeechRef.current = speech;
      await speech.promise;
      if (deviceSpeechRef.current !== speech) return;
      deviceSpeechRef.current = null;
      setVoiceState('READY');
    } catch {
      deviceSpeechRef.current = null;
      setTtsError(true);
      setVoiceState('READY');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  // ─── Context value ────────────────────────────────────────────────────────

  const value: VoiceSessionContextType = {
    isActive,
    sessionPaused,
    voiceState,
    transcript,
    response,
    streamingResponse,
    errorMsg,
    ttsError,
    convId,
    history,
    initContext,
    autoplayBlocked,
    showHistory,
    activeContent,
    sermonResults,
    hasAudioElement,
    startSession,
    endSession,
    pauseSession,
    resumeSession,
    stopPlayback,
    handleOrbTap,
    handleTapToHear,
    handleRetryAudio,
    setShowHistory,
    updateVisualContext,
    registerNavigate,
  };

  return (
    <VoiceSessionContext.Provider value={value}>
      {children}
    </VoiceSessionContext.Provider>
  );
}
