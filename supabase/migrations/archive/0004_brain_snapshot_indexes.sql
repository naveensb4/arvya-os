CREATE INDEX "source_items_brain_created_at_idx" ON "source_items" USING btree ("brain_id", "created_at");
CREATE INDEX "memory_objects_brain_created_at_idx" ON "memory_objects" USING btree ("brain_id", "created_at");
CREATE INDEX "open_loops_brain_created_at_idx" ON "open_loops" USING btree ("brain_id", "created_at");
CREATE INDEX "relationships_brain_created_at_idx" ON "relationships" USING btree ("brain_id", "created_at");
CREATE INDEX "workflows_brain_created_at_idx" ON "workflows" USING btree ("brain_id", "created_at");
CREATE INDEX "agent_runs_brain_started_at_idx" ON "agent_runs" USING btree ("brain_id", "started_at");
