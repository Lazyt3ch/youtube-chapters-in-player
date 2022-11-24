import * as youtubei from './youtubei.js'

setUpWebRequestOriginRemoval()

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type == 'fetchChapters') {
        fetchChapters(request.videoId)
            .then(sendResponse)
            .catch(e => {
                console.error(e)
            })
        return true
    }
})

function setUpWebRequestOriginRemoval() {
    chrome.permissions.contains({ 
        permissions: ['webRequestBlocking'],
        origins: ['https://www.youtube.com/']
    }, (permissionExists) => {
        if (permissionExists) { // In Firefox (Manifest V2)
            // YouTube declines requests with wrong Origin.
            // We have to remove the Origin header which is added automatically by the browser.
            chrome.webRequest.onBeforeSendHeaders.addListener(
                details => {
                    const newRequestHeaders = details.requestHeaders.filter(header => {
                        return header.name.toLowerCase() !== "origin"
                    })
                    return {requestHeaders: newRequestHeaders}
                },
                {urls: ["https://www.youtube.com/*"]},
                ["blocking", "requestHeaders", chrome.webRequest.OnBeforeSendHeadersOptions.EXTRA_HEADERS].filter(Boolean)
            )
        } // In Chrome/Chromium (Manifest V3), Origin is removed via declarative net request
    })    
}

async function fetchChapters(videoId) {
    const videoResponse = await youtubei.fetchVideo(videoId)
    let chapters = youtubei.chaptersFromVideoResponse(videoResponse)

    const commentChapters = await fetchChaptersFromComments(videoResponse)
    console.log('commentChapters =', commentChapters)

    if (chapters.length > commentChapters.length) {
        return chapters
    }
    return commentChapters
}

async function fetchChaptersFromComments(videoResponse) {
    const comments = await youtubei.fetchComments(videoResponse)

    const minNumChapters = 2

    for (let i = 0; i < comments.length; i++) {
        if (!comments[i].isPinned) {
            continue
        }
        const tsContexts = getTimestampContexts(comments[i].text)
        if (tsContexts.length >= minNumChapters) {
            return tsContexts
        }
    }    

    return []
}

function getTimestampContexts(text) {
    // const timestampSplitPattern = /((?:\d?\d:)?(?:\d?\d:)\d\d)\s/
    const timestampSplitPattern = /((?:\d?\d:)?(?:\d?\d:)\d\d)(?:\s|$)/

    const chapters = []
    const lines = text.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
        console.log('lines[i] =', lines[i])

        const parts = lines[i]
            .trim()
            .split(timestampSplitPattern) 

        // Normally:
        //   parts.length is always an odd number
        //   parts[0] contains an empty string (and is not used);
        //   parts[1], parts[3], etc. contain a chapter timestamp;
        //   parts[2], parts[4], etc. contain a chapter title.   

        // Example 1:
        // '0:09:27 стек вызовов / Call Stack'
        // =>
        // ['', '0:09:27', 'стек вызовов / Call Stack']

        // Example 2:
        // ' 0:09:27 стек вызовов / Call Stack 0:18:26 Mixed Solution 0:21:42 принцип LIFO'
        // =>
        // ['', '0:09:27', 'стек вызовов / Call Stack ', '0:18:26', 'Mixed Solution ', '0:21:42', 'принцип LIFO']

        // Example 3:
        // 'стек вызовов / Call Stack 0:18:26 Some text'
        // =>
        // ['стек вызовов / Call Stack ', '0:18:26', 'Some text']

        // Example 4:
        // ''
        // =>
        // ['']        

        // Example 5:
        // 'Линус Торвальдс: программирование 1:23:25 код 01:23:50 структуры данных 1:25:00'
        // =>
        // ['Линус Торвальдс: программирование ', '1:23:25', 'код ', '01:23:50', 'структуры данных 1:25:00']           

        console.log('parts =', parts)

        if (parts.length < 3) {
            continue
        }

        // if (parts[0].trim().length) { // Non-empty string in parts[0] is an abnormal case
        //     continue
        // }

        const isTitleBeforeTimestamp = parts[0].trim().length

        const startPos = isTitleBeforeTimestamp ? 0 : 1
        // const endPos = isTitleBeforeTimestamp ? 0 : 1
        const lastTimestampPos = parts.length - 2

        for (let p = startPos; p <= lastTimestampPos; p += 2) {
            const titlePos = isTitleBeforeTimestamp ? p : p + 1
            const title = parts[titlePos].trim()

            // const title = parts[p + 1].trim()
            if (!title.length) {
                continue
            }

            const timestampPos = isTitleBeforeTimestamp ? p + 1 : p            
            const timestamp = parts[timestampPos]
            const time = youtubei.parseTimestamp(timestamp)

            chapters.push({
                title,
                timestamp,
                time,
            })         
        }
    }

    chapters.sort((a, b) => a.time - b.time)
    return chapters
}
