import type { MealResponse, MealDetailResponse, Recipe, Ingredient } from '../types/recipe';

const DESSERT_API_URL = 'https://www.themealdb.com/api/json/v1/1/filter.php?c=Dessert';
const MEAL_DETAIL_URL = 'https://www.themealdb.com/api/json/v1/1/lookup.php?i=';

/**
 * Fetch all dessert recipes from TheMealDB API
 */
export async function fetchDessertRecipes(): Promise<MealResponse> {
  const response = await fetch(DESSERT_API_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch dessert recipes: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Expand common cooking unit abbreviations
 */
function expandUnits(measure: string): string {
  if (!measure) return measure;
  
  return measure
    // Handle fractions first
    .replace(/1\/2/g, '½')
    .replace(/1\/3/g, '⅓')
    .replace(/2\/3/g, '⅔')
    .replace(/1\/4/g, '¼')
    .replace(/3\/4/g, '¾')
    .replace(/1\/8/g, '⅛')
    // Expand abbreviations
    .replace(/\btsp\b\.?/gi, 'teaspoon')
    .replace(/\btbsp\b\.?/gi, 'tablespoon')
    .replace(/\btbl\b\.?/gi, 'tablespoon')
    .replace(/\bT\b\.?/g, 'tablespoon')
    .replace(/\bt\b\.?/g, 'teaspoon')
    .replace(/\boz\b\.?/gi, 'ounce')
    .replace(/\blb\b\.?/gi, 'pound')
    .replace(/\blbs\b\.?/gi, 'pounds')
    .replace(/\bpt\b\.?/gi, 'pint')
    .replace(/\bqt\b\.?/gi, 'quart')
    .replace(/\bgal\b\.?/gi, 'gallon')
    .replace(/\bfl\.?\s*oz\b\.?/gi, 'fluid ounce')
    .replace(/\bg\b(?!\w)/gi, 'gram')
    .replace(/\bkg\b(?!\w)/gi, 'kilogram')
    .replace(/\bml\b(?!\w)/gi, 'milliliter')
    .replace(/\bl\b(?!\w)/gi, 'liter')
    // Handle plurals properly
    .replace(/(\d+)\s*teaspoon(?!s)/gi, (match, num) => 
      parseInt(num) === 1 ? match : match + 's')
    .replace(/(\d+)\s*tablespoon(?!s)/gi, (match, num) => 
      parseInt(num) === 1 ? match : match + 's')
    .replace(/(\d+)\s*ounce(?!s)/gi, (match, num) => 
      parseInt(num) === 1 ? match : match + 's')
    .trim();
}

/**
 * Get a recipe image from Wikimedia Commons
 */
async function getWikimediaImage(recipeName: string): Promise<string> {
  try {
    // Clean up recipe name for better search
    const searchTerm = recipeName
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ')     // Normalize spaces
      .trim();
    
    // Try different search variations for better results
    const searchVariations = [
      `${searchTerm} dessert`,
      `${searchTerm} cake`,
      `${searchTerm} food`,
      searchTerm
    ];
    
    for (const search of searchVariations) {
      // Search Wikimedia Commons API
      const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(search)}&srnamespace=6&srlimit=3&origin=*`;
      
      const response = await fetch(searchUrl);
      const data = await response.json();
      
      if (data.query?.search && data.query.search.length > 0) {
        // Try each result until we find a good image
        for (const result of data.query.search) {
          const fileName = result.title.replace('File:', '');
          
          // Skip SVG and non-image files
          if (fileName.match(/\.(svg|pdf|txt)$/i)) continue;
          
          // Get the actual image URL
          const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=File:${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=url&iiurlwidth=800&origin=*`;
          
          const imageResponse = await fetch(imageInfoUrl);
          const imageData = await imageResponse.json();
          
          const pages = imageData.query?.pages;
          if (pages) {
            const pageId = Object.keys(pages)[0];
            const imageInfo = pages[pageId]?.imageinfo?.[0];
            const imageUrl = imageInfo?.thumburl || imageInfo?.url;
            
            if (imageUrl && !imageUrl.includes('svg')) {
              return imageUrl;
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to fetch Wikimedia image:', error);
  }
  
  // Fallback to curated food images from Wikimedia Commons
  const fallbackImages = [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Good_Food_Display_-_NCI_Visuals_Online.jpg/800px-Good_Food_Display_-_NCI_Visuals_Online.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Chocolate_cake.jpg/800px-Chocolate_cake.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Desserts.jpg/800px-Desserts.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/2ChocolateCake.jpg/800px-2ChocolateCake.jpg'
  ];
  
  return fallbackImages[Math.floor(Math.random() * fallbackImages.length)];
}

/**
 * Fetch detailed recipe information by meal ID
 */
export async function fetchRecipeDetails(mealId: string): Promise<Recipe> {
  const response = await fetch(MEAL_DETAIL_URL + mealId);
  if (!response.ok) {
    throw new Error(`Failed to fetch recipe details: ${response.statusText}`);
  }
  
  const data: MealDetailResponse = await response.json();
  const meal = data.meals[0];
  
  if (!meal) {
    throw new Error('Recipe not found');
  }

  // Process ingredients and measurements
  const ingredients: Ingredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const ingredient = meal[`strIngredient${i}` as keyof typeof meal] as string;
    const measure = meal[`strMeasure${i}` as keyof typeof meal] as string;
    
    if (ingredient && ingredient.trim()) {
      ingredients.push({
        name: ingredient.trim(),
        measure: expandUnits(measure?.trim() || '')
      });
    }
  }

  // Use fallback image from Wikimedia Commons if the original is null or empty
  let recipeImage = meal.strMealThumb && meal.strMealThumb.trim() 
    ? meal.strMealThumb 
    : await getWikimediaImage(meal.strMeal);

  return {
    id: meal.idMeal,
    name: meal.strMeal,
    image: recipeImage,
    instructions: meal.strInstructions,
    ingredients,
    category: meal.strCategory,
    area: meal.strArea,
    youtubeUrl: meal.strYoutube || undefined,
    tags: meal.strTags ? meal.strTags.split(',').map(tag => tag.trim()) : undefined
  };
}

/**
 * Get a random dessert recipe
 */
export async function getRandomDessertRecipe(): Promise<Recipe> {
  const desserts = await fetchDessertRecipes();
  
  if (!desserts.meals || desserts.meals.length === 0) {
    throw new Error('No dessert recipes found');
  }
  
  // Pick a random recipe from the list
  const randomIndex = Math.floor(Math.random() * desserts.meals.length);
  const randomMeal = desserts.meals[randomIndex];
  
  // Fetch detailed information for the selected recipe
  return fetchRecipeDetails(randomMeal.idMeal);
}