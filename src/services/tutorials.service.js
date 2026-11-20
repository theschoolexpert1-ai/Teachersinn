'use strict';
function createTutorialsService({repository,HttpError}) { return {
  list:(u)=>repository.list(u),detail(u,id){const t=repository.find(id);if(!t)throw new HttpError(404,'Tutorial not found.');repository.view(u,id);return{...t,steps:JSON.parse(t.steps),saved:repository.saved(u,id).saved,related:repository.related(t.category,id)};},
  toggle(u,id){if(!repository.find(id))throw new HttpError(404,'Tutorial not found.');repository.toggle(u,id);return{ok:true,saved:repository.saved(u,id).saved};},
}; }
module.exports={createTutorialsService};
