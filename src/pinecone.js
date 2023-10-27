import { PineconeClient } from "@pinecone-database/pinecone";
import { models, createEmbedding } from "./openai.js";
import { v4 } from "uuid";
import { config } from "dotenv";
config();

// Initialize the Pinecone client
const pinecone = new PineconeClient();

// Define the namespace and index name
const NAMESPACE = process.env.pineconeNamespace;
const INDEX = process.env.pineconeIndex;

/**
 * Initializes Pinecone with the specified environment and API key from environment variables.
 * @returns {Promise<void>} A promise that resolves when Pinecone is successfully initialized, or rejects with an error message if Pinecone could not be initialized.
 */
const initPinecone = async () => {
	await pinecone
		.init({
			environment: process.env.pineconeEnvironment,
			apiKey: process.env.pineconeApiKey,
		})
		.catch((error) => {
			throw `Failed to initialize Pinecone. Error: ${error}`;
		});
};

// Initialize the Pinecone client
await initPinecone().catch((error) => {
	console.log(error);
});

/**
 * Deletes all vectors from the Pinecone index.
 * @returns {Promise<void>} A promise that resolves when the deletion is successful, or rejects with an error message if the deletion could not be performed.
 */
async function deletePineconeVectors() {
	console.log("Attempting to delete vectors from the Pinecone index...");

	try {
		// Create a Pinecone index object with the specified index ID
		const index = pinecone.Index(INDEX);

		// Perform the deletion operation by calling the 'delete1' method with 'deleteAll' set to true and 'namespace' specified
		await index.delete1({
			deleteAll: true,
			namespace: NAMESPACE,
		});

		console.log("Deleted all vectors in the index.");
	} catch (error) {
		throw `Failed to delete Pinecone vectors: Error: ${error}`;
	}
}

/**
 * Generates Pinecone embeddings from the given string and upserts them to Pinecone.
 * @param {string} str The input string to generate Pinecone embeddings from.
 * @returns {Promise<void>} A promise that resolves when the operation is successful, or rejects with an error message if an error occurred.
 */
async function generatePineconeEmbeddings(str) {
	try {
		// In order to generate new embeddings, we need to delete all vectors first
		await deletePineconeVectors();

		console.log("Generating Pinecone embeddings...");

		// Convert the provided email content to a JSON string
		const email = JSON.stringify(str, null, 2);

		let embeddings = await createEmbedding(models.embeddings, email);

		// Extract the embeddings from the generated embeddings object
		const embeddingsArr = embeddings.map((entry) => entry.embedding);

		// Create an array of objects containing the embeddings, each with a unique ID and metadata
		const vectors = embeddingsArr.map((value, i) => ({
			id: v4(), // Generate a unique ID for each embedding
			metadata: { email }, // Add the email content as metadata
			values: value, // Embedding values
		}));

		// Create a Pinecone index object with the specified index ID
		const index = pinecone.Index(INDEX);

		const insertBatches = [];

		// Upsert the vectors in batches to Pinecone
		while (vectors.length) {
			const batchedVectors = vectors.splice(0, 250); // Take a batch of 250 vectors
			const pineconeUpsertRequest = { namespace: NAMESPACE, vectors: batchedVectors };
			index
				.upsert({ upsertRequest: pineconeUpsertRequest })
				.then((pineconeResult) => {
					insertBatches.push(pineconeResult);
				})
				.catch((error) => {
					throw `Failed to upsert to Pinecone: ${error}`;
				});
		}

		console.log("Successfully generated embeddings and upserted to Pinecone.");
	} catch (error) {
		throw `Failed to generate Pinecone embeddings. Error: ${error}`;
	}
}

/**
 * Retrieves relevant content from Pinecone using the provided string as a query vector.
 * @param {string} str - The input string for generating the query vector.
 * @param {number} topK - The number of closest matches to retrieve from Pinecone.
 * @returns {Promise<Array>} - An array of relevant content retrieved from Pinecone.
 * @throws {Error} - If an error occurs during the process.
 */
async function retrievePineconeEmbeddings(str, topK) {
	try {
		// Create an embedding using the provided string
		const embeddings = await createEmbedding(models.embeddings, str);

		// Extract the vector from the embeddings result
		let vector = embeddings[0].embedding;

		// Query Pinecone for the closest matches based on the vector
		const index = pinecone.Index(INDEX);
		const queryResults = await index.query({
			queryRequest: {
				vector,
				namespace: NAMESPACE,
				topK: topK,
				includeMetadata: true,
			},
		});

		// Initialize an array to store the relevant content from Pinecone matches
		const pinecone_relevant_content = [];

		// Extract the relevant content (emails) from the query results
		for (const match of queryResults.matches) {
			pinecone_relevant_content.push(match.metadata.email);
		}

		// Return the array of relevant content retrieved from Pinecone
		return JSON.stringify(pinecone_relevant_content);
	} catch (error) {
		throw `Failed to retrieve Pinecone embeddings. Error: ${error}`;
	}
}

export { pinecone, NAMESPACE, INDEX, generatePineconeEmbeddings, retrievePineconeEmbeddings };
