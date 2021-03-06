const {
    expect
} = require('chai');
const knex = require('knex');
const app = require('../src/app')
const {
    makeArticlesArray
} = require('./articles.fixtures')

describe.only('Articles Endpoints', function () {
    let db

    before('make knex instance', () => {
        db = knex({
            client: 'pg',
            connection: process.env.TEST_DB_URL,
        })
        app.set('db', db);
    })

    after('disconnect from db', () => db.destroy())

    before('clean the table', () => db('blogful_articles').truncate())

    afterEach('cleanup', () => db('blogful_articles').truncate())

    describe(`GET /articles`, () => {
        context('Given there are articles in the database', () => {
            const testArticles = makeArticlesArray()

            beforeEach('insert articles', () => {
                return db
                    .into('blogful_articles')
                    .insert(testArticles)
            })

            it('responds with 200 and all of the articles', () => {
                return supertest(app)
                    .get('/articles')
                    .expect(200, testArticles)
            })
        })

        context('Given no articles', () => {
            it(`responds with 200 and an empty list`, () => {
                return supertest(app)
                    .get('/articles')
                    .expect(200, [])
            })
        })
    })

    describe(`GET /articles/:article_id`, () => {
        context('Given there are articles in the database', () => {
            const testArticles = makeArticlesArray()

            beforeEach('insert articles', () => {
                return db
                    .into('blogful_articles')
                    .insert(testArticles)
            })

            it('responds with 200 and the specified article', () => {
                const articleId = 4
                const expectedArticle = testArticles[articleId - 1]
                return supertest(app)
                    .get(`/articles/${articleId}`)
                    .expect(200, expectedArticle)
            })

            describe(`POST /articles`, () => {
                it(`creates an article, responding with 201 and the new article`, function () {
                    this.retries(3)
                    const newArticle = {
                        title: 'Test new article',
                        style: 'Listicle',
                        content: 'Test new article content...'
                    }
                    return supertest(app)
                        .post('/articles')
                        .send(newArticle)
                        .expect(201)
                        .expect(res => {
                            expect(res.body.title).to.eql(newArticle.title)
                            expect(res.body.style).to.eql(newArticle.style)
                            expect(res.body.content).to.eql(newArticle.content)
                            expect(res.body).to.have.property('id')
                            expect(res.headers.location).to.eql(`/articles/${res.body.id}`)
                            const expected = new Date().toLocaleString()
                            const actual = new Date(res.body.date_published).toLocaleString()
                            expect(actual).to.eql(expected)
                        })
                        .then(postRes =>
                            supertest(app)
                            .get(`/articles/${postRes.body.id}`)
                            .expect(postRes.body)
                        )
                })

                const requiredFields = ['title', 'style', 'content'];

                requiredFields.forEach(field => {
                    const newArticle = {
                        title: 'Test new article',
                        style: 'Listicle',
                        content: 'Test new article content...'
                    }

                    it(`responds with 400 and an error message when the '${field}' is missing`, () => {
                        delete newArticle[field]

                        return supertest(app)
                            .post('/articles')
                            .send(newArticle)
                            .expect(400, {
                                error: {
                                    message: `Missing '${field}' in request body`
                                }
                            })
                    })
                })
            })

            describe.only(`DELETE /articles/:article_id`, () => {
                context('Given there are articles in the database', () => {
                    const idToRemove = 10
                    const expectedArticles = testArticles.filter(article => article.id !== idToRemove)
                    return supertest(app)
                        .delete(`/articles/${idToRemove}`)
                        .expect(204)
                        .then(res =>
                            supertest(app)
                            .get(`/articles`)
                            .expect(expectedArticles)
                        )
                })
            })
        })

        context(`Given an XSS attack article`, () => {
            const maliciousArticle = {
                id: 911,
                title: 'Naughty naughty very naughty <script>alert("xss");</script>',
                style: 'How-to',
                content: `Bad image <img src="https://url.to.file.which/does-not.exist" onerror="alert(document.cookie);">. But not <strong>all</strong> bad.`
            }

            this.beforeEach('insert malicious article', () => {
                return db
                    .into('blogful_articles')
                    .insert([maliciousArticle])
            })

            it('removes XSS attack content', () => {
                return supertest(app)
                    .get(`/articles/${maliciousArticle.id}`)
                    .expect(200)
                    .expect(res => {
                        expect(res.body.title).to.eql(`Naughty naughty very naughty &lt;script&gt;alert(\"xss\");&lt;/script&gt;`)
                        expect(res.body.content).to.eql(`Bad image <img src="https://url.to.file.which/does-not.exist">. But not <strong>all</strong> bad.`)
                    })
            })
        })

        context(`Given no articles`, () => {
            context(`Given no articles`, () => {
                it(`responds with 404`, () => {
                    const articleId = 123456;
                    return supertest(app)
                        .get(`/articles/${articleId}`)
                        .expect(404, {
                            error: {
                                message: `Article doesn't exist`
                            }
                        })
                })
            })
        })
    })
})