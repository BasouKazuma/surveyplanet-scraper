
class SurveyAnswer {

    constructor (question_id, question_title, participant_index, values) {
        this.question_id = question_id
        this.question_title = question_title
        this.participant_index = participant_index
        this.values = values
    }

    toCSVHeader() {
        let columns = []
        columns.push('participant_index')
        for (let entry of this.values) {
            columns.push(entry.label)
        }
        return columns.join(",") + '\n'
    }

    toCSV() {
        let columns = []
        columns.push(this.participant_index)
        for (let entry of this.values) {
            columns.push(entry.value)
        }
        return columns.join(",") + '\n'
    }

}

module.exports = SurveyAnswer
