const INNERTUBE_CLIENT_VERSION = "2.20211129.09.00"

export async function fetchChapters(videoId) {
    const videoResponse = await fetchVideo(videoId)
    // return chaptersFromVideoResponse(videoResponse)

    let chapters = chaptersFromVideoResponse(videoResponse)
    if (chapters.length) {
        return chapters
    }

    chapters = await fetchTimeComments(videoResponse)
    return chapters    
}

const engagementPanelIds = [
    'engagement-panel-macro-markers-description-chapters',
    'engagement-panel-macro-markers-auto-chapters'
]

function chaptersFromVideoResponse(videoResponse) {
    const result = videoResponse.find(e => e.response).response
        .engagementPanels.find(e => e.engagementPanelSectionListRenderer && engagementPanelIds.includes(e.engagementPanelSectionListRenderer.panelIdentifier))
        ?.engagementPanelSectionListRenderer.content.macroMarkersListRenderer.contents
        .map(content => content.macroMarkersListItemRenderer ? macroMarkersListItemRendererToChapter(content.macroMarkersListItemRenderer) : null)
        .filter(e => e ? true : false)
    return result ? result : []
}

function macroMarkersListItemRendererToChapter(renderer) {
    const title = renderer.title.simpleText
    const timestamp = renderer.timeDescription.simpleText
    const time = parseTimestamp(timestamp)
    return {
        title,
        timestamp,
        time
    }
}

async function fetchVideo(videoId) {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}&pbj=1`, {
        credentials: "omit",
        headers: {
            "X-Youtube-Client-Name": "1",
            "X-Youtube-Client-Version": INNERTUBE_CLIENT_VERSION
        }
    })
    return await response.json()
}

export function parseTimestamp(ts) {
    const parts = ts.split(':').reverse()
    const secs = parseInt(parts[0])
    if (secs > 59) {
        return null
    }
    const mins = parseInt(parts[1])
    if (mins > 59) {
        return null
    }
    const hours = parseInt(parts[2]) || 0
    return secs + (60 * mins) + (60 * 60 * hours)
}

// time-comments related code below

// const MAX_COMMENT_PAGES = 1
// const MAX_COMMENTS = 20

const INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
const INNERTUBE_CLIENT_NAME = "WEB"

async function fetchTimeComments(videoResponse) {
    const comments = await fetchComments(videoResponse)

    // Currently using only the first minimally suitable comment.
    // Maybe later implement more sophisticated comment selection.
    for (let i = 0; i < comments.length; i++) {
        const tsContexts = getTimestampContexts(comments[i].text)
        if (tsContexts.length) {
            return tsContexts
        }
    }    

    return []
}

// async function fetchComments(videoId) {
//     return await youtubei.fetchComments(videoId)
// }

function getTimestampContexts(text) {
    const TIMESTAMP_PATTERN = /^((?:\d?\d:)?(?:\d?\d:)\d\d)\s(.+)$/
    const chapters = []
    const lines = text.split("\r\n")

    for (let i = 0; i < lines.length; i++) {
        const tsMatch = lines[i].match(TIMESTAMP_PATTERN)
        if (!tsMatch) {
            return []
        }

        const timestamp = tsMatch[1]
        const title = tsMatch[2]

        const time = parseTimestamp(timestamp)

        chapters.push({
            title,
            timestamp,
            time,
        })
    }

    return chapters
}

export async function fetchComments(videoResponse) {
    let token = commentsContinuationToken(videoResponse)
    if (!token) {
        return []
    }
    const comments = []
    const commentsResponse = await fetchNext(token)

    const items = commentsResponse.onResponseReceivedEndpoints[1].reloadContinuationItemsCommand.continuationItems
    if (!items) {
        return []
    }
    for (const item of items) {
        if (item.commentThreadRenderer) {
            const cr = item.commentThreadRenderer.comment.commentRenderer
            const text = cr.contentText.runs
                .map(run => run.text)
                .join("")
            comments.push({ text })
        } else if (item.continuationItemRenderer) {
            token = item.continuationItemRenderer.continuationEndpoint.continuationCommand.token
        }
    }
    return comments
}

function commentsContinuationToken(videoResponse) {
    return videoResponse.find(e => e.response).response
        .contents.twoColumnWatchNextResults.results.results
        .contents.find(e => e.itemSectionRenderer && e.itemSectionRenderer.sectionIdentifier === 'comment-item-section').itemSectionRenderer
        .contents[0].continuationItemRenderer// When comments are disabled there is messageRenderer instead.
        ?.continuationEndpoint.continuationCommand.token
}

async function fetchNext(continuation) {
    const body = {
        context: {
            client: {
                clientName: INNERTUBE_CLIENT_NAME,
                clientVersion: INNERTUBE_CLIENT_VERSION
            }
        },
        continuation
    }
    const response = await fetch(`https://www.youtube.com/youtubei/v1/next?key=${INNERTUBE_API_KEY}`, {
        method: "POST",
        credentials: "omit",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    })

    return await response.json()
}

