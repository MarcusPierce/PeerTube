import { Transaction } from 'sequelize'
import { logger } from '@server/helpers/logger'
import { CONFIG } from '@server/initializers/config'
import { sequelizeTypescript } from '@server/initializers/database'
import { VideoModel } from '@server/models/video/video'
import { VideoJobInfoModel } from '@server/models/video/video-job-info'
import { MVideoFullLight, MVideoUUID } from '@server/types/models'
import { VideoState } from '@shared/models'
import { federateVideoIfNeeded } from './activitypub/videos'
import { Notifier } from './notifier'
import { addMoveToObjectStorageJob } from './video'

function buildNextVideoState (currentState?: VideoState) {
  if (currentState === VideoState.PUBLISHED) {
    throw new Error('Video is already in its final state')
  }

  if (
    currentState !== VideoState.TO_TRANSCODE &&
    currentState !== VideoState.TO_MOVE_TO_EXTERNAL_STORAGE &&
    CONFIG.TRANSCODING.ENABLED
  ) {
    return VideoState.TO_TRANSCODE
  }

  if (
    currentState !== VideoState.TO_MOVE_TO_EXTERNAL_STORAGE &&
    CONFIG.OBJECT_STORAGE.ENABLED
  ) {
    return VideoState.TO_MOVE_TO_EXTERNAL_STORAGE
  }

  return VideoState.PUBLISHED
}

function moveToNextState (video: MVideoUUID, isNewVideo = true) {
  return sequelizeTypescript.transaction(async t => {
    // Maybe the video changed in database, refresh it
    const videoDatabase = await VideoModel.loadAndPopulateAccountAndServerAndTags(video.uuid, t)
    // Video does not exist anymore
    if (!videoDatabase) return undefined

    // Already in its final state
    if (videoDatabase.state === VideoState.PUBLISHED) {
      return federateVideoIfNeeded(videoDatabase, false, t)
    }

    const newState = buildNextVideoState(videoDatabase.state)

    if (newState === VideoState.PUBLISHED) {
      return moveToPublishedState(videoDatabase, isNewVideo, t)
    }

    if (newState === VideoState.TO_MOVE_TO_EXTERNAL_STORAGE) {
      return moveToExternalStorageState(videoDatabase, isNewVideo, t)
    }
  })
}

async function moveToExternalStorageState (video: MVideoFullLight, isNewVideo: boolean, transaction: Transaction) {
  const videoJobInfo = await VideoJobInfoModel.load(video.id, transaction)
  const pendingTranscode = videoJobInfo?.pendingTranscode || 0

  // We want to wait all transcoding jobs before moving the video on an external storage
  if (pendingTranscode !== 0) return false

  await video.setNewState(VideoState.TO_MOVE_TO_EXTERNAL_STORAGE, isNewVideo, transaction)

  logger.info('Creating external storage move job for video %s.', video.uuid, { tags: [ video.uuid ] })

  try {
    await addMoveToObjectStorageJob(video, isNewVideo)

    return true
  } catch (err) {
    logger.error('Cannot add move to object storage job', { err })

    return false
  }
}

function moveToFailedTranscodingState (video: MVideoFullLight) {
  if (video.state === VideoState.TRANSCODING_FAILED) return

  return video.setNewState(VideoState.TRANSCODING_FAILED, false, undefined)
}

// ---------------------------------------------------------------------------

export {
  buildNextVideoState,
  moveToExternalStorageState,
  moveToFailedTranscodingState,
  moveToNextState
}

// ---------------------------------------------------------------------------

async function moveToPublishedState (video: MVideoFullLight, isNewVideo: boolean, transaction: Transaction) {
  logger.info('Publishing video %s.', video.uuid, { tags: [ video.uuid ] })

  const previousState = video.state
  await video.setNewState(VideoState.PUBLISHED, isNewVideo, transaction)

  // If the video was not published, we consider it is a new one for other instances
  // Live videos are always federated, so it's not a new video
  await federateVideoIfNeeded(video, isNewVideo, transaction)

  if (isNewVideo) Notifier.Instance.notifyOnNewVideoIfNeeded(video)

  if (previousState === VideoState.TO_TRANSCODE) {
    Notifier.Instance.notifyOnVideoPublishedAfterTranscoding(video)
  }
}
