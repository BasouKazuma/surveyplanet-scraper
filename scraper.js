const fs = require('fs');
const puppeteer = require('puppeteer')
const rp = require('request-promise')
const $ = require('cheerio')

const base_www_url = 'https://app.surveyplanet.com'
const base_api_url = 'https://api.surveyplanet.com/v1'

credentials = require('./credentials.json')


const loginRequest = async () => {
    const browser = await puppeteer.launch(
    {
        'args' : [ '--disable-web-security' ]
    })
    const page = await browser.newPage()
    await page.goto(base_www_url + '/login')
    // await page.focus('#email')
    await page.waitForSelector('#email')
    await page.waitForSelector('#password')
    await page.type('#email', credentials.user_email)
    // await page.focus('#password')
    await page.type('#password', credentials.user_password)
    await page.click('#login-button')

    await page.waitForNavigation()
    var access_token = await page.evaluate(() => {
      return localStorage.getItem('access_token')
    })
    access_token = access_token.replace(/^"|"$/g, '')
    await browser.close()
    return access_token
}

/********************************
  App Logic
********************************/

var currentAccessToken

loginRequest()
.then(function(access_token){
    currentAccessToken = access_token
    return rp({
        method: 'GET',
        uri: base_api_url + '/survey/summary?_=' + new Date().getTime(),
        headers: {
            'Authorization': 'Bearer ' + currentAccessToken
        },
        json: true
    })
})
.then(function(surveySummaryResponse){
    console.log("Reached surveySummaryResponse")
    // console.log(surveySummaryResponse)
    let answerSummaryPromises = []
    if (Array.isArray(surveySummaryResponse.data) && surveySummaryResponse.data.length > 0) {
        for (let i = 0; i < surveySummaryResponse.data.length; ++i) {
            console.log("Reached surveySummaryResponse for loop")
            let survey = surveySummaryResponse.data[i]
            // console.log(survey)
            let answerSummaryResponse = rp({
                method: 'GET',
                uri: base_api_url + '/answers/summary/' + survey._id + '?_=' + new Date().getTime(),
                headers: {
                    'Authorization': 'Bearer ' + currentAccessToken
                },
                json: true
            })
            // console.log(answerSummaryResponse)
            answerSummaryPromises.push(answerSummaryResponse)
        }
    }
    return Promise.all(answerSummaryPromises)
})
.then(function(answerSummaryResponses) {
    console.log("Reached answerSummaryResponse")
    // console.log(answerSummaryResponses)
    let answerListPromises = []
    if (Array.isArray(answerSummaryResponses) && answerSummaryResponses.length > 0) {
        for (let answerSummaryObject of answerSummaryResponses) {
            if (Array.isArray(answerSummaryObject.data) && answerSummaryObject.data.length > 0) {
                for (let answerSummaryEntry of answerSummaryObject.data) {
                    // console.log(answerSummaryEntry)
                    let currentCount = 0
                    let pageLimit = 30
                    while (currentCount < answerSummaryEntry.answered) {
                      console.log(currentCount)
                        let answerListResponse = rp({
                            method: 'GET',
                            uri: base_api_url
                                + '/answers?where%5Bquestion%5D=' + answerSummaryEntry._id
                                + '&populate%5B0%5D%5Bpath%5D=participant'
                                + '&populate%5B0%5D%5Bselect%5D=_id+email+index&populate%5B1%5D%5Bpath%5D=question&populate%5B1%5D%5Bselect%5D=_id+title'
                                + '&limit=' + pageLimit
                                + '&reverse=false'
                                + '&type=' + answerSummaryEntry.type
                                + '&_=' + new Date().getTime(),
                            headers: {
                                'Authorization': 'Bearer ' + currentAccessToken
                            },
                            json: true
                        })
                        console.log("Reached answerListResponse for loop")
                        // console.log(answerListResponse)
                        answerListPromises.push(answerListResponse)
                        currentCount += pageLimit
                    }
                }
            }
        }
    }
    return Promise.all(answerListPromises)
})
.then(function(answerListResponse) {
    // console.log(answerListResponse)
    for (let answer of answerListResponse) {
        // console.log(answer.data)
    }
})
.catch(function(err){
    //handle error
    console.log("An error occurred")
    console.log(err)
})


