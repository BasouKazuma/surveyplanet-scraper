
class SurveyAnswer {

    constructor (question_id, question_title, participant_index, participant_answers) {
        this.question_id = question_id
        this.question_title = question_title
        this.participant_index = participant_index
        this.participant_answers = participant_answers
    }

    toCSVHeader() {
        let columns = []
        columns.push('participant_index')
        for (let entry of this.participant_answers) {
            columns.push(entry.label)
        }
        return '"' + columns.join('","') + '"' + '\n'
    }

    toCSV() {
        let columns = []
        columns.push(this.participant_index)
        for (let entry of this.participant_answers) {
            columns.push(entry.value)
        }
        return '"' + columns.join('","') + '"' + '\n'
    }

}

module.exports = SurveyAnswer
