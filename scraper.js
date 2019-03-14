const fs = require('fs');
const puppeteer = require('puppeteer')
const rp = require('request-promise')
const $ = require('cheerio')

const SurveyAnswer = require('./libs/models/SurveyAnswer.js')

const BASE_WWW_URL = 'https://app.surveyplanet.com'
const BASE_API_URL = 'https://api.surveyplanet.com/v1'

const CREDENTIALS = require('./credentials.json')

var CURRENT_ACCESS_TOKEN

// List of survey ids
var SURVEY_IDS = []

// survey_id => {survey_data}
var SURVEY_MAP = {}

// question_id => {question_data}
var QUESTION_MAP = {}

// question_id => [{partipant_answer_data}]
var SURVEY_ANSWERS = {}


const loginRequest = async () => {
    const browser = await puppeteer.launch(
    {
        'args' : [ '--disable-web-security' ]
    })
    const page = await browser.newPage()
    await page.goto(BASE_WWW_URL + '/login')
    // await page.focus('#email')
    await page.waitForSelector('#email')
    await page.waitForSelector('#password')
    await page.type('#email', CREDENTIALS.user_email)
    // await page.focus('#password')
    await page.type('#password', CREDENTIALS.user_password)
    await page.click('#login-button')

    await page.waitForNavigation()
    var access_token = await page.evaluate(() => {
      return localStorage.getItem('access_token')
    })
    access_token = access_token.replace(/^"|"$/g, '')
    await browser.close()
    return access_token
}

const surveySummaryRequest = async (accessToken) => {
    return rp({
        method: 'GET',
        uri: BASE_API_URL + '/survey/summary?_=' + new Date().getTime(),
        headers: {
            'Authorization': 'Bearer ' + accessToken
        },
        json: true
    })
}

const surveyInfoRequest = async (accessToken, surveyId) => {
    return rp({
        method: 'GET',
        uri: BASE_API_URL + '/survey/' + surveyId + '?populate%5B0%5D%5Bpath%5D=questions&_=' + new Date().getTime(),
        headers: {
            'Authorization': 'Bearer ' + accessToken
        },
        json: true
    })
}

const answersSummaryRequest = async (accessToken, surveyId) => {
    return rp({
        method: 'GET',
        uri: BASE_API_URL + '/answers/summary/' + surveyId + '?_=' + new Date().getTime(),
        headers: {
            'Authorization': 'Bearer ' + accessToken
        },
        json: true
    })
}

const answersRequest = async (accessToken, answerSummaryEntry) => {
    let currentCount = 0
    let pageLimit = 30
    let currentAnswerResponse = null
    let answerResponseList = []
    while (currentCount < answerSummaryEntry.answered) {
        let additionalParams = ""
        if (currentAnswerResponse) {
            additionalParams = '&sort=_id&after=' + currentAnswerResponse.data[29]._id
        }
        currentAnswerResponse = await rp({
            method: 'GET',
            uri: BASE_API_URL
                + '/answers?where%5Bquestion%5D=' + answerSummaryEntry._id
                + '&populate%5B0%5D%5Bpath%5D=participant'
                + '&populate%5B0%5D%5Bselect%5D=_id+email+index&populate%5B1%5D%5Bpath%5D=question&populate%5B1%5D%5Bselect%5D=_id+title'
                + '&limit=' + pageLimit
                + '&reverse=false'
                + '&type=' + answerSummaryEntry.type
                + additionalParams
                + '&_=' + new Date().getTime(),
            headers: {
                'Authorization': 'Bearer ' + accessToken
            },
            json: true
        })
        answerResponseList.push(...currentAnswerResponse.data)
        currentCount += pageLimit
    }
    return answerResponseList
}

const parseAnswer = (questionMap, answerResponse) => {
    let questionResponse = questionMap[answerResponse.question._id]
    let answerlabelMap = {}
    for (let i = 0; i < answerResponse.values.length; ++i) {
        let entry = answerResponse.values[i]
        answerlabelMap[entry.label] = entry.value
    }
    let participant_answers = []
    switch (answerResponse.type) {
        case 'multiple_choice':
            participant_answers.push({
                label: 'value',
                value: answerResponse.values[0].label
            })
            break
        case 'essay':
            // TODO
            break
        case 'form':
            for (let questionLabel of questionResponse.properties.labels) {
                participant_answers.push({
                    label: questionLabel,
                    value: answerlabelMap[questionLabel]
                })
            }
            break
        case 'scoring':
            for (let questionLabel of questionResponse.properties.labels) {
                participant_answers.push({
                    label: questionLabel,
                    value: answerlabelMap[questionLabel]
                })
            }
            break
    }
    let surveyAnswer = new SurveyAnswer(
        answerResponse.question._id,
        answerResponse.question.title,
        answerResponse.participant.index,
        participant_answers
    )
   return surveyAnswer
}

/********************************
  App Logic
********************************/

loginRequest()
.then(function(access_token) {
    CURRENT_ACCESS_TOKEN = access_token
    return surveySummaryRequest(CURRENT_ACCESS_TOKEN)
})
.then(function(surveySummaryResponse) {
    let surveyInfoPromises = []
    if (Array.isArray(surveySummaryResponse.data) && surveySummaryResponse.data.length > 0) {
        for (let survey of surveySummaryResponse.data) {
            SURVEY_IDS.push(survey._id)
            SURVEY_MAP[survey._id] = survey
            let surveyInfoResponse = surveyInfoRequest(CURRENT_ACCESS_TOKEN, survey._id)
            surveyInfoPromises.push(surveyInfoResponse)
        }
    }
    return Promise.all(surveyInfoPromises)
})
.then(function(surveyInfoResponseList) {
    let answerSummaryPromises = []
    if (Array.isArray(surveyInfoResponseList) && surveyInfoResponseList.length > 0) {
        for (let survey of surveyInfoResponseList) {
            if (Array.isArray(survey.data.questions) && survey.data.questions.length > 0) {
                for (let question of survey.data.questions) {
                    QUESTION_MAP[question._id] = question
                }
            }
            let answerSummaryResponse = answersSummaryRequest(CURRENT_ACCESS_TOKEN, survey.data._id)
            answerSummaryPromises.push(answerSummaryResponse)
        }
    }
    return Promise.all(answerSummaryPromises)
})
.then(function(answerSummaryResponseList) {
    let answerResponseListPromises = []
    if (Array.isArray(answerSummaryResponseList) && answerSummaryResponseList.length > 0) {
        for (let answerSummaryObject of answerSummaryResponseList) {
            if (Array.isArray(answerSummaryObject.data) && answerSummaryObject.data.length > 0) {
                for (let answerSummaryEntry of answerSummaryObject.data) {
                    let answerResponseList = answersRequest(CURRENT_ACCESS_TOKEN, answerSummaryEntry)
                    answerResponseListPromises.push(answerResponseList)
                }
            }
        }
    }
    return Promise.all(answerResponseListPromises)
})
.then(function(answerResponseList) {
    let output_folder = __dirname + '/output'
    let folder = output_folder + '/' + new Date().getTime()
    try {
        fs.statSync(output_folder)
    } catch (err) {
        fs.mkdirSync(output_folder, { recursive: true })
    }
    try {
        fs.statSync(folder)
    } catch (err) {
        fs.mkdirSync(folder, { recursive: true })
    }
    if (Array.isArray(answerResponseList) && answerResponseList.length > 0) {
        for (let answerResponses of answerResponseList) {
            if (Array.isArray(answerResponses) && answerResponses.length > 0) {
                for (let answerResponse of answerResponses) {
                    if (!SURVEY_ANSWERS[answerResponse.question._id]) {
                        SURVEY_ANSWERS[answerResponse.question._id] = []
                    }
                    SURVEY_ANSWERS[answerResponse.question._id].push(answerResponse)
                    let surveyAnswer = parseAnswer(QUESTION_MAP, answerResponse)
                    let filename = folder + '/' + answerResponse.question._id + '.csv'
                    let file_exists = fs.existsSync(filename)
                    if (!file_exists) {
                        fs.writeFileSync(filename, surveyAnswer.toCSVHeader())
                    }
                    fs.appendFileSync(filename, surveyAnswer.toCSV())
                }
            }
        }
    }
})
.catch(function(err) {
    //handle error
    console.log("An error occurred")
    console.log(err)
})


