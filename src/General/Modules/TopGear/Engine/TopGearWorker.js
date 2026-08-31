

self.onmessage = async function (e) {
    const {
      gameType,
      itemSets,
      itemList,
      wepCombos,
      strippedPlayer,
      contentType,
      baseHPS,
      currentLanguage,
      playerSettings,
      strippedCastModel,
      shard
    } = e.data;
  
    try {
      if (gameType === "Retail") {
        const { runTopGearShard } = await import("./TopGearEngine.ts");

        // A worker evaluates one shard of the run and hands back its own best sets; the main thread merges the
        // shards into the report. A run that isn't split is just the one shard.
        // Progress messages are posted as the run advances. The worker thread is busy the whole time, but posting
        // doesn't need it to yield - the main thread picks them up on its own event loop.
        const result = await runTopGearShard(
          itemList,
          wepCombos,
          strippedPlayer,
          contentType,
          baseHPS,
          playerSettings,
          strippedCastModel,
          true,
          (progress) => self.postMessage({ progress }),
          shard || { index: 0, count: 1 }
        );
  
        self.postMessage({ success: true, result });
      }
      else if (gameType === "Classic") {
        const { runTopGearClassic } = await import('./TopGearEngineClassic.js');
  
        const result = await runTopGearClassic(
          itemSets,
          strippedPlayer,
          contentType,
          baseHPS,
          currentLanguage,
          playerSettings,
          strippedCastModel
        );
    
        self.postMessage({ success: true, result });
      }
    } catch (error) {
      self.postMessage({ success: false, error: error.message || error });
    }
  };
  