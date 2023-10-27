import { AutoGPT } from "langchain/experimental/autogpt";
import { ReadFileTool, WriteFileTool, SerpAPI } from "langchain/tools";
import { InMemoryFileStore } from "langchain/stores/file/in_memory";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { DynamicTool } from "langchain/tools";
import { WebBrowser } from "langchain/tools/webbrowser";
import { OpenAI } from "langchain/llms/openai";
import axios from "axios";
import cheerio from "cheerio";

const store = new InMemoryFileStore();

const tools = [
	new ReadFileTool({ store }),
	new WriteFileTool({ store }),
	new DynamicTool({
		name: "bing_search",
		description: "call this to get top 5 search results for your query. input should be search query",
		func: async (query) => {
			console.log("LLM searched bing for: " + query);
			//const apiKey = process.env.googleApiKey;
			//const cseId = process.env.googlecseID;
			try {
				const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
				try {
					const { data } = await axios.get(url);
					const $ = cheerio.load(data);
					const cardSelector = ".news-card.newsitem.cardcommon";
					const fieldSelectors = {
						url: "data-url",
						title: ".title",
						description: ".snippet",
						publishedTime: '.source span[tabindex="0"]',
					};

					let results = [];

					$(cardSelector).each(function (index) {
						if (index >= 5) {
							return false; // Stop after 5 results
						}

						const url = $(this).attr(fieldSelectors.url);
						const title = $(this).find(fieldSelectors.title).text();
						const description = $(this).find(fieldSelectors.description).text();
						const publishedTime = $(this).find(fieldSelectors.publishedTime).text();

						results.push({
							url,
							title,
							description,
							publishedTime,
						});
					});

					console.log(JSON.stringify(results, null, 2));
				} catch (error) {
					console.error(`Something went wrong: ${error.message}`);
				}
				// const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
				// 	params: {
				// 		key: apiKey,
				// 		cx: cseId,
				// 		q: query,
				// 		num: 5, // Number of search results
				// 	},
				// });
				// return JSON.stringify(
				// 	response.data.items.map((item) => ({
				// 		title: item.title,
				// 		link: item.link,
				// 		snippet: item.snippet,
				// 	}))
				// );
			} catch (error) {
				JSON.stringify(`Error occurred while fetching search results: ${error.message}`);
			}
		},
	}),
	new WebBrowser({ model: new OpenAI({ openAIApiKey: process.env.openaiApiKey }) }),
];

const vectorStore = new MemoryVectorStore(new OpenAIEmbeddings());

const autogpt = AutoGPT.fromLLMAndTools(new ChatOpenAI({ temperature: 0 }), tools, {
	memory: vectorStore.asRetriever(),
	aiName: "Tom",
	aiRole: "Assistant",
});

await autogpt.run([
	"You are a New Canaan CT journalist investigating local news and events in your town. Your task is to generate unique and professional articles based on news reporting from other sources. Put special empathy for your town and make sure to put it in the main focus of the article. Do not make up information! Task: Research this topic 'Week 4 Connecticut high school football top performers - New Canaan CT' and generate an article about it.",
]);
